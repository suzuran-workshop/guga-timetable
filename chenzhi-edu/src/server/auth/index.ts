import {
  createDrizzleUserStore,
  createDrizzlePasswordStore,
  createDrizzleSessionStore,
  SessionManager,
  PasswordProvider,
} from '@homurajs/auth'
import { createAuthRoutes, sessionMiddleware, requireAuth } from '@homurajs/auth/hono'
import { createLogger } from '@homurajs/core'
import type { DbBundle } from '../db/index.js'
import type { RuntimeAdapter } from '@homurajs/app-kit'

/**
 * 认证装配（@homurajs/auth）。
 *
 * - 密码认证：UsernamePassword 登录/注册（教务系统不接第三方 IdP，走 password provider）。
 * - 会话：HS256 短 JWT（access）+ opaque refresh（rotate + 族吊销），存 refresh_tokens 表。
 * - cookie Secure 跟随 adapter.trustProxy()（qw-pages 恒 https）。
 *
 * 返回 app-kit createApp({ auth }) 所需的注入包：{ sessions, sessionMiddleware, authRoutes }。
 */
export interface AuthBundle {
  sessions: SessionManager
  password: PasswordProvider
  sessionMiddleware: ReturnType<typeof sessionMiddleware>
  authRoutes: ReturnType<typeof createAuthRoutes>
  requireAuth: ReturnType<typeof requireAuth>
  secure: boolean
}

export function createAuth(opts: {
  bundle: DbBundle
  secret: string
  accessTtlSec: number
  refreshTtlSec: number
  allowRegister: boolean
  adapter: RuntimeAdapter
  loginPath?: string
}): AuthBundle {
  const logger = createLogger().child('auth')
  const db = opts.bundle.db as any // DrizzleDb（pg | sqlite）

  const userStore = createDrizzleUserStore(db)
  const passwordStore = createDrizzlePasswordStore(db)
  const sessionStore = createDrizzleSessionStore(db)

  const sessions = new SessionManager(
    {
      secret: opts.secret,
      accessTokenTtlSec: opts.accessTtlSec,
      refreshTokenTtlSec: opts.refreshTtlSec,
    },
    sessionStore,
  )

  const password = new PasswordProvider({ userStore, passwordStore })

  // cookie Secure：反代后（qw-pages 恒 true / standalone TRUST_PROXY=1）
  const secure = opts.adapter.trustProxy()
  const loginPath = opts.loginPath ?? '/login'

  const authRoutes = createAuthRoutes({
    sessions,
    password,
    allowRegister: opts.allowRegister,
    secure,
    defaultReturnTo: '/',
  })

  const sessMw = sessionMiddleware(sessions, { bearer: true, secure })
  const requireAuthMw = requireAuth({ loginPath })

  logger.info('认证装配完成', { secure, allowRegister: opts.allowRegister, loginPath })

  return {
    sessions,
    password,
    sessionMiddleware: sessMw,
    authRoutes,
    requireAuth: requireAuthMw,
    secure,
  }
}
