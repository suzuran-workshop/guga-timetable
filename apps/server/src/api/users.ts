import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { Services } from '../repo/index.js'
import type { ProfileRepo } from '../repo/profile.js'
import { requireLogin, requireAdmin, currentUser, jsonBody } from './guards.js'
import { Role, ROLE_LABEL, permissionsOf, type Permission } from '@guga/shared'

/**
 * 用户/档案路由：
 * - GET  /api/auth/me        当前会话用户（SessionUser，含 role+permissions）
 * - GET  /api/users          用户列表（admin）
 * - PATCH /api/users/:id     改角色/实名（admin）
 * 身份登录（/auth/password/*、/auth/refresh、/auth/logout）由 @homurajs/auth 挂在根，不在此。
 */
export function userRoutes(svc: Services, profiles: ProfileRepo): Hono {
  const app = new Hono()

  app.get('/me', requireLogin, async (c) => {
    const user = currentUser(c)!
    return c.json({ user, permissions: permissionsOf(user.role) })
  })

  /** 用户列表：auth users 表 join profiles（admin 管理角色用） */
  app.get('/', requireAdmin, async (c) => {
    const list = await profiles.listProfiles()
    return c.json({
      items: list.map((p: { userId: string; role: string; realName: string | null; phone: string | null; teacherId: string | null; createdAt: number }) => ({
        userId: p.userId,
        role: p.role,
        roleLabel: ROLE_LABEL[p.role as Role] ?? p.role,
        realName: p.realName,
        phone: p.phone,
        teacherId: p.teacherId,
        createdAt: p.createdAt,
      })),
    })
  })

  /** 改用户角色/实名（admin）。首个用户保护：不允许把最后一个 admin 降级。 */
  app.patch('/:id', requireAdmin, async (c) => {
    const body = await jsonBody<{ role?: Role; realName?: string; phone?: string }>(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const targetId = c.req.param('id')
    const actor = currentUser(c)!

    if (body.role && !Role.includes(body.role)) {
      return c.json({ error: 'invalid_role' }, 400)
    }
    // 保护：不允许把最后一个 admin 降级
    if (body.role && body.role !== 'admin') {
      const current = await profiles.getRole(targetId)
      if (current === 'admin') {
        const all = await profiles.listProfiles()
        const adminCount = all.filter((p: { role: string }) => p.role === 'admin').length
        if (adminCount <= 1) return c.json({ error: 'last_admin', message: '不能降级唯一的管理员' }, 409)
      }
    }
    await profiles.upsertProfile(targetId, {
      role: body.role, realName: body.realName, phone: body.phone,
    })
    return c.json({ ok: true, role: body.role ?? await profiles.getRole(targetId) })
  })

  return app
}
