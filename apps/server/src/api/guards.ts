import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import type { Permission, Role, SessionUser } from '../../shared/domain.js'
import { can, permissionsOf } from '../../shared/domain.js'
import type { ProfileRepo } from '../repo/profile.js'

/**
 * 路由层公共工具：会话用户解析 + RBAC 守卫 + 统一错误/校验响应。
 *
 * @homurajs/auth 的 sessionMiddleware 已把 claims 放进 c.get('auth')；
 * 这里再用 ProfileRepo 把 claims.sub 扩展成含 role/permissions 的 SessionUser，
 * 挂到 c.get('user')，供 requirePerm 与业务路由消费。
 */

declare module 'hono' {
  interface ContextVariableMap {
    user?: SessionUser
  }
}

/** 解析并挂载 SessionUser（无身份则 user=undefined，交由 requirePerm 决定 401） */
export function attachUser(profiles: ProfileRepo) {
  return createMiddleware(async (c, next) => {
    const claims = (c as any).get('auth')
    if (claims?.sub) {
      const user = await profiles.resolveSessionUser(claims.sub)
      if (user) c.set('user', user)
    }
    await next()
  })
}

/** 取当前会话用户（可能 undefined） */
export function currentUser(c: Context): SessionUser | undefined {
  return c.get('user')
}

/** 必须登录：无身份回 401 JSON */
export const requireLogin = createMiddleware(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'unauthorized', message: '请先登录' }, 401)
  await next()
})

/** 必须拥有某权限：登录 + RBAC 校验 */
export function requirePerm(perm: Permission) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'unauthorized', message: '请先登录' }, 401)
    if (!can(user.role, perm)) {
      return c.json({ error: 'forbidden', message: `缺少权限「${perm}」`, role: user.role }, 403)
    }
    await next()
  })
}

/** 必须是 admin（危险操作：删用户、改角色、系统设置） */
export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized', message: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden', message: '需要管理员权限', role: user.role }, 403)
  await next()
})

/** 解析 JSON body，失败回 400 */
export async function jsonBody<T = any>(c: Context): Promise<T | null> {
  try {
    return (await c.req.json()) as T
  } catch {
    return null
  }
}

/** zod 校验包装：返回 data 或抛出带 422 语义的 ApiValidationError */
export class ApiValidationError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super('validation_failed')
  }
}
