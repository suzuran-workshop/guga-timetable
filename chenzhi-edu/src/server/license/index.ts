import { LicenseClient, createDrizzleStateStore } from '@homurajs/license'
import { licenseGuard, requireFeature, createDefaultBypass, LICENSE_STATUS_PATH } from '@homurajs/license/hono'
import { createLogger } from '@homurajs/core'
import type { DbBundle } from '../db/index.js'

/**
 * 授权装配（@homurajs/license）。
 *
 * - LicenseClient：注册 + 心跳 + 本地状态机（验签用 GENUINE_PUBLIC_KEY）。
 * - licenseGuard：到期/停服全局处置（豁免 healthz + /auth/* + /_license）。
 * - requireFeature：逐点功能闸门（默认拒绝，只认验签通过的 features）。
 *
 * licenseEnabled=false 时返回 null，server 跳过守卫（纯本地开发）。
 * 注册失败不致命：fail-open 进宽限期，心跳恢复后自动转 active（ADR-011 精神）。
 */
export interface LicenseBundle {
  client: LicenseClient
  guard: ReturnType<typeof licenseGuard>
  requireFeature: (feature: string) => ReturnType<typeof requireFeature>
  statusPath: string
}

export async function createLicense(opts: {
  bundle: DbBundle
  enabled: boolean
  server: string
  productId: string
  appId: string
  licenseKey?: string
  publicKey?: string
  healthzPath: string
}): Promise<LicenseBundle | null> {
  const logger = createLogger().child('license')
  if (!opts.enabled) {
    logger.info('授权守卫已禁用（LICENSE_ENABLED=false）')
    return null
  }

  const stateStore = createDrizzleStateStore(opts.bundle.db as any)
  const client = new LicenseClient({
    server: opts.server,
    productId: opts.productId,
    appId: opts.appId,
    licenseKey: opts.licenseKey || undefined,
    publicKey: opts.publicKey || undefined,
    stateStore,
    onInvalidSignature: 'suspend', // 验签失败一律停服（生产安全缺省）
  })

  // 注册（网络失败 fail-open：进 unknown/grace，心跳恢复后转 active）
  try {
    const reg = await client.register()
    logger.info('授权注册成功', { licenseId: reg.licenseId, status: reg.status, signature: client.getSignatureState().kind })
  } catch (e: any) {
    logger.warn('授权注册失败，进入宽限期（fail-open）', { error: e.message, server: opts.server })
  }

  // 心跳循环（网络失败走宽限期，不抛错）
  client.startHeartbeat({
    onError: (e) => logger.warn('授权心跳失败', { error: e.message }),
  })

  const bypass = createDefaultBypass({ healthzPath: opts.healthzPath })
  const guard = licenseGuard(client, { bypass, healthzPath: opts.healthzPath })
  const feature = (name: string) => requireFeature(client, name)

  return { client, guard, requireFeature: feature, statusPath: LICENSE_STATUS_PATH }
}
