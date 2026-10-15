import { Hono } from 'hono'
import { swapLessonsSchema, toISODate } from '@guga/shared'
import type { Services } from '../repo/index.js'
import { requirePerm, jsonBody, currentUser } from './guards.js'

/**
 * 调换课路由（/api/schedule-exceptions）。
 *
 * GET  /day?date=&teacherId=&classId=  解析某日实际课次（循环排课 ⊕ 例外）
 * GET  /                               例外列表（可按 date/scheduleId 过滤）
 * POST /cancel                         停课
 * POST /substitute                     代课（换教师）
 * POST /swap                           对调两次课
 * DELETE /:id                          撤销单条例外
 * POST /occurrence/clear               清空某次课的所有例外（恢复正常）
 */
export function scheduleExceptionRoutes(svc: Services): Hono {
  const app = new Hono()

  app.get('/day', requirePerm('schedule:read'), async (c) => {
    const u = new URL(c.req.url)
    const date = u.searchParams.get('date') ?? toISODate(Date.now())
    const teacherId = u.searchParams.get('teacherId') ?? undefined
    const classId = u.searchParams.get('classId') ?? undefined
    const lessons = await svc.scheduleException.resolveDay(date, { teacherId, classId })
    return c.json({ date, items: lessons })
  })

  app.get('/', requirePerm('schedule:read'), async (c) => {
    const u = new URL(c.req.url)
    const items = await svc.scheduleException.list({
      originalDate: u.searchParams.get('originalDate') ?? undefined,
      targetDate: u.searchParams.get('targetDate') ?? undefined,
      scheduleId: u.searchParams.get('scheduleId') ?? undefined,
    })
    return c.json({ items })
  })

  app.post('/cancel', requirePerm('schedule:write'), async (c) => {
    const body = await jsonBody<{ scheduleId: string; date: string; reason?: string }>(c)
    if (!body?.scheduleId || !body?.date) return c.json({ error: 'invalid_body', message: '需要 scheduleId 与 date' }, 400)
    const exc = await svc.scheduleException.cancel(body.scheduleId, body.date, body.reason, currentUser(c)?.id)
    return c.json(exc, 201)
  })

  app.post('/substitute', requirePerm('schedule:write'), async (c) => {
    const body = await jsonBody<{ scheduleId: string; date: string; teacherId: string; reason?: string }>(c)
    if (!body?.scheduleId || !body?.date || !body?.teacherId) {
      return c.json({ error: 'invalid_body', message: '需要 scheduleId / date / teacherId' }, 400)
    }
    const exc = await svc.scheduleException.substitute(body.scheduleId, body.date, body.teacherId, body.reason, currentUser(c)?.id)
    return c.json(exc, 201)
  })

  app.post('/swap', requirePerm('schedule:write'), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = swapLessonsSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 422)
    }
    const result = await svc.scheduleException.swap(parsed.data, currentUser(c)?.id)
    if (!result.ok) return c.json({ error: 'swap_failed', message: result.message }, 409)
    return c.json({ ok: true, exceptions: result.exceptions }, 201)
  })

  app.post('/occurrence/clear', requirePerm('schedule:write'), async (c) => {
    const body = await jsonBody<{ scheduleId: string; date: string }>(c)
    if (!body?.scheduleId || !body?.date) return c.json({ error: 'invalid_body' }, 400)
    const cleared = await svc.scheduleException.clearOccurrence(body.scheduleId, body.date)
    return c.json({ ok: true, cleared })
  })

  app.delete('/:id', requirePerm('schedule:write'), async (c) => {
    const ok = await svc.scheduleException.remove(c.req.param('id'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  return app
}
