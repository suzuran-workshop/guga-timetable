import { Hono } from 'hono'
import { termSchema, toISODate } from '@guga/shared'
import type { Services } from '../repo/index.js'
import { requirePerm, jsonBody } from './guards.js'

/**
 * 学期路由（/api/terms）。
 *
 * GET  /            学期列表（含当前学期）
 * GET  /current     当前学期（无则 404）
 * POST /            新建学期
 * PATCH /:id        更新学期
 * POST /:id/current 设为当前学期（互斥）
 * DELETE /:id       删除学期
 *
 * 权限复用 setting:write（学期属系统配置）。
 */
export function termRoutes(svc: Services): Hono {
  const app = new Hono()

  /**
   * 课表上下文（任何登录用户可读，仅需 schedule:read）：
   * 当前学期 + 今天的教学周/星期。课表页与调换课页据此定位「第几周」。
   * 无当前学期时 week 回退 1、term 为 null（前端提示「未设置学期」）。
   */
  app.get('/context', requirePerm('schedule:read'), async (c) => {
    const [term, currentWeek] = await Promise.all([svc.term.getCurrent(), svc.term.currentWeek()])
    const todayIso = toISODate(Date.now())
    const resolved = await svc.term.resolveDate(todayIso)
    return c.json({ term, currentWeek, today: todayIso, weekday: resolved.weekday })
  })

  app.get('/', requirePerm('setting:write'), async (c) => {
    return c.json({ items: await svc.term.list() })
  })

  app.get('/current', requirePerm('setting:write'), async (c) => {
    const cur = await svc.term.getCurrent()
    if (!cur) return c.json({ error: 'not_found' }, 404)
    return c.json(cur)
  })

  app.post('/', requirePerm('setting:write'), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = termSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 422)
    }
    const created = await svc.term.create(parsed.data)
    return c.json(created, 201)
  })

  app.patch('/:id', requirePerm('setting:write'), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = termSchema.partial().safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 422)
    }
    const updated = await svc.term.update(c.req.param('id'), parsed.data)
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated)
  })

  app.post('/:id/current', requirePerm('setting:write'), async (c) => {
    const updated = await svc.term.setCurrent(c.req.param('id'))
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated)
  })

  app.delete('/:id', requirePerm('setting:write'), async (c) => {
    const ok = await svc.term.remove(c.req.param('id'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  return app
}
