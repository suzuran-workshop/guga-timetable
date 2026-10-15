import { existsSync } from 'node:fs'
import { Hono } from 'hono'
import { createApp } from '@homurajs/app-kit'
import { createNodeAdapter } from '@homurajs/app-kit/serve'
import { createQwPagesAdapter } from '@homurajs/app-kit/qw-pages'
import { createLogger, detectRuntime, healthzPathFor } from '@homurajs/core'
import { LICENSE_STATUS_PATH } from '@homurajs/license/hono'

import { loadConfig } from './env.js'
import { createDatabase, migrate } from './db/index.js'
import { initTables } from './db/tables.js'
import { Services } from './repo/index.js'
import { ProfileRepo } from './repo/profile.js'
import { createAuth } from './auth/index.js'
import { createLicense } from './license/index.js'
import { createStorage } from './storage/index.js'
import { createApiRoutes } from './api/index.js'
import { fileProxyRoutes } from './api/files.js'
import { licenseRoutes } from './api/license.js'

/**
 * Guga 课务 · 服务端装配入口。
 *
 * 六模块协作（固定中间件链由 @homurajs/app-kit 的 createApp 保证）：
 *   core      → 配置装载 / 结构化日志 / 形态探测 / 健康检查路径同源
 *   db        → 双方言持久层（node:sqlite 缺省）+ 启动迁移 + parity 校验
 *   auth      → 密码登录 + 自管会话（HS256 JWT + refresh rotate）
 *   license   → 注册/心跳 + 停服守卫 + 功能闸门（对接本地 genuine-mock）
 *   storage   → 对象存储（local-fs）+ /files 代理下载
 *   app-kit   → createApp 中间件链装配 + 双形态 RuntimeAdapter 启动
 *
 * 链序：basePath → requestId/日志 → healthz → licenseGuard → sessionMiddleware
 *        → authRoutes → App routes(/_license,/files,/api) → 静态 → SPA fallback → onError
 */
async function main() {
  const cfg = loadConfig()
  const logger = createLogger({ level: cfg.get('logLevel') as any }).child('boot')

  // ---- 1. 形态探测 + adapter 选择（app-kit / core）----
  // 'auto' 是 createApp 的选项语义，不是 detectRuntime 的合法 env 值：
  // 走启发式探测前必须把 HOMURA_RUNTIME=auto 从 env 摘掉，否则 detectRuntime 抛非法值。
  const runtimeOpt = cfg.get('runtime')
  if (runtimeOpt === 'auto') delete process.env.HOMURA_RUNTIME
  const target = runtimeOpt === 'auto' ? detectRuntime(process.env).target : (runtimeOpt as any)
  const adapter = target === 'qw-pages' ? createQwPagesAdapter() : createNodeAdapter()
  const healthzPath = healthzPathFor(target)
  logger.info('运行形态', { target, explicit: runtimeOpt !== 'auto', port: cfg.get('port') })

  // ---- 2. 持久层（db）----
  const bundle = createDatabase({
    dbPath: cfg.get('dbPath'),
    databaseUrl: cfg.get('databaseUrl'),
    logger,
  })
  await migrate(bundle)
  initTables(bundle)

  // ---- 3. 服务容器 + 档案仓储 ----
  const svc = new Services(bundle)
  const profiles = new ProfileRepo(bundle)

  // ---- 4. 存储（storage）----
  const storage = createStorage(cfg.get('storageDir'))

  // ---- 5. 认证（auth）----
  const auth = createAuth({
    bundle,
    secret: cfg.get('authSecret'),
    accessTtlSec: cfg.get('accessTokenTtlSec'),
    refreshTtlSec: cfg.get('refreshTokenTtlSec'),
    allowRegister: cfg.get('allowRegister'),
    adapter,
    loginPath: '/login',
  })

  // ---- 6. 授权（license）----
  const license = await createLicense({
    bundle,
    enabled: cfg.get('licenseEnabled'),
    server: cfg.get('genuineServer'),
    productId: cfg.get('genuineProductId'),
    appId: cfg.get('genuineAppId'),
    licenseKey: cfg.get('genuineLicenseKey'),
    publicKey: cfg.get('genuinePublicKey'),
    healthzPath,
  })

  // ---- 7. 业务路由 ----
  const apiRoutes = createApiRoutes({ svc, profiles, storage, ns: 'guga' })

  // 根级路由：/_license（守卫豁免）+ /files 代理 + /api（登录+鉴权）
  // 注意：createFileProxyRoutes 内部已注册在 /files/:key{.+}，故挂在根（不能再加 /files 前缀）
  const appRoutes = new Hono()
  appRoutes.route(LICENSE_STATUS_PATH, licenseRoutes(license?.client ?? null))
  appRoutes.route('/', fileProxyRoutes(storage))
  appRoutes.route('/api', apiRoutes)

  // ---- 8. 静态资源（生产：dist/client；开发由 Vite dev server 提供）----
  const assetsDir = adapter.assetsDir(process.env)
  const staticDir = existsSync(assetsDir) ? assetsDir : undefined
  logger.info('静态资源', { assetsDir, mounted: !!staticDir })

  // ---- 9. createApp 装配（app-kit）----
  const { app, runtime, healthzPath: registeredHealthz } = createApp({
    runtime: target,
    auth: {
      sessions: auth.sessions,
      sessionMiddleware: auth.sessionMiddleware,
      authRoutes: auth.authRoutes,
    },
    license: license ? { client: license.client, guard: license.guard } : false,
    healthz: {
      path: healthzPath,
      checks: [
        { name: 'db', check: async () => { await svc.student.countByStatus(); return true } },
        { name: 'license', check: async () => !license || license.client.getStatus() !== 'suspended' },
      ],
    },
    staticDir,
    routes: appRoutes,
    logger,
    onError: (err, { path }) => {
      logger.error('请求处理异常', { path, message: err.message })
      return Response.json({ error: 'internal_error', message: err.message, path }, { status: 500 })
    },
  })

  logger.info('装配完成', { runtime: runtime.target, healthzPath: registeredHealthz, license: license ? 'on' : 'off' })

  // ---- 10. 启动（adapter 监听端口）----
  await adapter.start(app, { port: cfg.get('port') })
  logger.info('🚀 Guga 课务已启动', { url: `http://${cfg.get('host')}:${cfg.get('port')}`, target: runtime.target })

  // 优雅关闭
  const shutdown = () => {
    logger.info('收到退出信号，正在关闭…')
    if (license?.retryTimer) clearInterval(license.retryTimer)
    license?.client.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('启动失败：', err)
  process.exit(1)
})
