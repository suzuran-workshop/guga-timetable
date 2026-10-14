import { Hono } from 'hono'
import { scheduleSchema } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { requirePerm, jsonBody } from './guards.js'

/**
 * 排课路由：创建/更新会跑冲突检测，冲突时回 409 + conflicts 列表。
 * 排课的 teacherId 来自所属班级，创建/更新时由服务端解析注入冲突检测。
 */
export function scheduleRoutes(svc: Services): Hono {
  const app = new Hono()

  app.get('/', requirePerm('schedule:read'), async (c) => {
    const u = new URL(c.req.url)
    const week = u.searchParams.get('week') ? Number(u.searchParams.get('week')) : undefined
    const teacherId = u.searchParams.get('teacherId') ?? undefined
    const classId = u.searchParams.get('classId') ?? undefined
    return c.json({ items: await svc.schedule.weekTimetable({ week, teacherId, classId }) })
  })

  app.post('/', requirePerm('schedule:write'), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = scheduleSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 422)
    }
    // 解析班级教师，供冲突检测
    const cls = await svc.klass.getById(parsed.data.classId)
    if (!cls) return c.json({ error: 'class_not_found' }, 404)
    const result = await svc.schedule.create({ ...parsed.data, teacherId: cls.teacherId })
    if (!result.ok) return c.json({ error: 'schedule_conflict', conflicts: result.conflicts }, 409)
    return c.json(result.schedule, 201)
  })

  app.patch('/:id', requirePerm('schedule:write'), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = scheduleSchema.partial().safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 422)
    }
    const existing = await svc.schedule.getFullById(c.req.param('id'))
    if (!existing) return c.json({ error: 'not_found' }, 404)
    const cls = await svc.klass.getById(existing.classId)
    const result = await svc.schedule.update(c.req.param('id'), { ...parsed.data, teacherId: cls?.teacherId })
    if (!result.ok) return c.json({ error: 'schedule_conflict', conflicts: result.conflicts }, 409)
    return c.json({ ok: true })
  })

  app.delete('/:id', requirePerm('schedule:write'), async (c) => {
    const ok = await svc.schedule.remove(c.req.param('id'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  return app
}
