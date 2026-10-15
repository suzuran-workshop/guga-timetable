import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createPrivateKey, sign, createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canonicalize,
  GENUINE_ENDPOINTS,
  keyIdOf,
  type LicenseEntitlement,
  type RegisterRequest,
  type RegisterResponse,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type SignedEntitlement,
} from '@homurajs/license/contract'

/**
 * 本地 genuine 授权中心（开发/演示用）——实现 @homurajs/license 的契约端点。
 *
 * 真实部署应对接供应方的中央授权服务（homura-genuine）。本 mock 用 tools/.keys/private.pem
 * 的 Ed25519 私钥对 entitlement 签名（签名对象 = canonicalize(entitlement)），
 * 消费侧用配套公钥（GENUINE_PUBLIC_KEY）验签，完整走通「注册 → 心跳 → 验签」链路。
 *
 * 通过环境变量切换授权状态，便于演示 license 守卫的处置：
 *   MOCK_STATUS=active|expired|suspended   （缺省 active）
 *   MOCK_ENFORCEMENT=none|notice|core|all  （缺省 notice）
 *   MOCK_EXPIRES_DAYS=30                   （到期天数；<=0 表示已过期）
 *   MOCK_FEATURES=schedule,finance,export  （授权功能范围，逗号分隔）
 */

const PORT = Number(process.env.MOCK_PORT ?? 8790)
const HOST = process.env.MOCK_HOST ?? '127.0.0.1'
const PRODUCT_ID = process.env.GENUINE_PRODUCT_ID ?? 'guga-timetable'
const APP_ID = process.env.GENUINE_APP_ID ?? 'guga-timetable-app'

const STATUS = (process.env.MOCK_STATUS ?? 'active') as LicenseEntitlement['status']
const ENFORCEMENT = (process.env.MOCK_ENFORCEMENT ?? 'notice') as LicenseEntitlement['enforcement']
const EXPIRES_DAYS = Number(process.env.MOCK_EXPIRES_DAYS ?? 30)
const FEATURES = (process.env.MOCK_FEATURES ?? 'dashboard,student,teacher,course,class,schedule,attendance,grade,order,setting,export').split(',').map((s) => s.trim()).filter(Boolean)
const HEARTBEAT_INTERVAL_SEC = Number(process.env.MOCK_HEARTBEAT_SEC ?? 3600)
const GRACE_SEC = Number(process.env.MOCK_GRACE_SEC ?? 86400)

// ---- 载入签名私钥 ----
const privPath = resolve('tools/.keys/private.pem')
const pubPath = resolve('tools/.keys/public.pem')
if (!existsSync(privPath) || !existsSync(pubPath)) {
  console.error('❌ 缺少 Ed25519 密钥对。请先运行：npm run genkeys')
  process.exit(1)
}
const PRIVATE_PEM = readFileSync(privPath, 'utf8')
const PUBLIC_PEM = readFileSync(pubPath, 'utf8').trim()
const KEY_ID = keyIdOf(PUBLIC_PEM)
const privateKey = createPrivateKey(PRIVATE_PEM)

/** 对 entitlement 签名，产出 SignedEntitlement */
function signEntitlement(ent: LicenseEntitlement): SignedEntitlement {
  const data = Buffer.from(canonicalize(ent), 'utf8')
  const signature = sign(null, data, privateKey).toString('base64url')
  return { entitlement: ent, signature, keyId: KEY_ID }
}

/** 构造一份授权载荷 */
function buildEntitlement(instanceKey: string, licenseId: string): LicenseEntitlement {
  const now = Date.now()
  const expiresAt = EXPIRES_DAYS > 0
    ? new Date(now + EXPIRES_DAYS * 86400_000).toISOString()
    : new Date(now - 86400_000).toISOString() // 已过期
  return {
    licenseId,
    productId: PRODUCT_ID,
    appId: APP_ID,
    instanceKey,
    status: STATUS,
    expiresAt: STATUS === 'expired' ? expiresAt : (EXPIRES_DAYS > 0 ? expiresAt : null),
    enforcement: ENFORCEMENT,
    features: FEATURES,
    notice: STATUS === 'active' ? null : (STATUS === 'expired' ? '演示授权已到期，请续期。' : '演示授权已被停用。'),
    issuedAt: new Date(now).toISOString(),
    serverTime: new Date(now).toISOString(),
    heartbeatIntervalSec: HEARTBEAT_INTERVAL_SEC,
    graceSec: GRACE_SEC,
  }
}

// licenseId 注册表（内存，演示用）
const licenses = new Map<string, { instanceKey: string; licenseId: string }>()

const app = new Hono()

app.post(GENUINE_ENDPOINTS.register, async (c) => {
  const body = (await c.req.json()) as RegisterRequest
  const licenseId = `lic_${createHash('sha256').update(body.instanceKey).digest('hex').slice(0, 16)}`
  licenses.set(licenseId, { instanceKey: body.instanceKey, licenseId })
  const ent = buildEntitlement(body.instanceKey, licenseId)
  const resp: RegisterResponse = {
    licenseId,
    status: STATUS,
    heartbeatIntervalSec: HEARTBEAT_INTERVAL_SEC,
    graceSec: GRACE_SEC,
    issuedAt: ent.issuedAt,
    license: signEntitlement(ent),
  }
  console.log(`[genuine-mock] register instanceKey=${body.instanceKey.slice(0, 8)}… → licenseId=${licenseId} status=${STATUS}`)
  return c.json(resp)
})

app.post(GENUINE_ENDPOINTS.heartbeat, async (c) => {
  const body = (await c.req.json()) as HeartbeatRequest
  const rec = licenses.get(body.licenseId)
  if (!rec || rec.instanceKey !== body.instanceKey) {
    return c.json({ error: 'instance_mismatch', message: 'instanceKey 与注册不符' }, 400)
  }
  const ent = buildEntitlement(rec.instanceKey, rec.licenseId)
  const resp: HeartbeatResponse = {
    status: STATUS,
    heartbeatIntervalSec: HEARTBEAT_INTERVAL_SEC,
    serverTime: ent.serverTime,
    license: signEntitlement(ent),
  }
  return c.json(resp)
})

app.get(GENUINE_ENDPOINTS.keys, (c) => {
  return c.json({ keys: [{ keyId: KEY_ID, publicKey: PUBLIC_PEM, retired: false }] })
})

app.get('/', (c) => c.json({
  service: 'genuine-mock',
  status: STATUS,
  enforcement: ENFORCEMENT,
  expiresDays: EXPIRES_DAYS,
  features: FEATURES,
  keyId: KEY_ID,
  endpoints: GENUINE_ENDPOINTS,
}))

console.log(`🔑 genuine-mock 授权中心启动 http://${HOST}:${PORT}`)
console.log(`   status=${STATUS} enforcement=${ENFORCEMENT} expiresDays=${EXPIRES_DAYS} features=${FEATURES.length}项 keyId=${KEY_ID}`)
serve({ fetch: app.fetch, port: PORT, hostname: HOST })
