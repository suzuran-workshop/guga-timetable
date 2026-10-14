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
  /** 注册失败时的后台重试定时器（成功或关闭时清理）；已注册则为 null */
  retryTimer: NodeJS.Timeout | null
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

  // 注册（网络失败 fail-open：不阻断启动，后台重试；授权中心起来后自动激活）
  let registered = false
  try {
    const reg = await client.register()
    registered = true
    logger.info('授权注册成功', { licenseId: reg.licenseId, status: reg.status, signature: client.getSignatureState().kind })
  } catch (e: any) {
    logger.warn('授权注册失败，fail-open 运行（后台每 15s 重试；授权中心可用后自动激活）', { error: e.message, server: opts.server })
  }

  // 心跳循环：仅在 register 成功后启动（LicenseClient 要求先 register 再 startHeartbeat，否则抛错）。
  // 注册失败时不启动心跳——client 状态为 unknown，licenseGuard 在 strict=false 下 fail-open 放行。
  if (registered) {
    client.startHeartbeat({
      onError: (e) => logger.warn('授权心跳失败', { error: e.message }),
    })
  }

  const bypass = createDefaultBypass({ healthzPath: opts.healthzPath })
  const guard = licenseGuard(client, { bypass, healthzPath: opts.healthzPath })
  const feature = (name: string) => requireFeature(client, name)

  return {
    client,
    guard,
    requireFeature: feature,
    statusPath: LICENSE_STATUS_PATH,
    // 未注册成功时，后台周期性重试 register；成功后启动心跳。供 server 在关闭时清理。
    retryTimer: registered ? null : startRegisterRetry(client, logger),
  }
}

/**
 * 注册重试循环：授权中心暂不可达时（如忘开 genuine-mock），每 15s 重试一次 register，
 * 成功后启动心跳并停止重试。让「先起业务服务、后起授权中心」也能自动激活，无需重启。
 */
function startRegisterRetry(client: LicenseClient, logger: ReturnType<typeof createLogger>): NodeJS.Timeout {
  const RETRY_MS = 15_000
  const timer = setInterval(async () => {
    try {
      const reg = await client.register()
      client.startHeartbeat({ onError: (e) => logger.warn('授权心跳失败', { error: e.message }) })
      logger.info('授权注册重试成功，已激活并启动心跳', { licenseId: reg.licenseId, status: reg.status })
      clearInterval(timer)
    } catch {
      // 仍不可达，静默等待下一轮（已有启动期 warn，不重复刷屏）
    }
  }, RETRY_MS)
  // 不阻止进程退出
  timer.unref?.()
  return timer
}
