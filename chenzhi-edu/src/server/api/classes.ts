import { Hono } from 'hono'
import { classSchema } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { createCrudRoutes, baseQuery } from './crud.js'
import { requirePerm, jsonBody } from './guards.js'

/** 班级路由：标准 CRUD + 成员管理 + 班级课表。 */
export function classRoutes(svc: Services): Hono {
  const app = new Hono()

  const crud = createCrudRoutes({
    resource: '班级',
    permBase: 'class',
    schema: classSchema,
    repo: svc.klass,
    parseListQuery: (c) => {
      const u = new URL(c.req.url)
      return {
        ...baseQuery(c),
        status: u.searchParams.get('status') ?? undefined,
        courseId: u.searchParams.get('courseId') ?? undefined,
      }
    },
  })
  app.route('/', crud)

  /** 全量班级（下拉选择用） */
  app.get('/options/all', requirePerm('class:read'), async (c) => {
    const all = await svc.klass.list({ pageSize: 200 })
    return c.json({ items: all.items })
  })

  /** 班级成员列表 */
  app.get('/:id/members', requirePerm('class:read'), async (c) => {
    const cls = await svc.klass.getById(c.req.param('id'))
    if (!cls) return c.json({ error: 'not_found' }, 404)
    return c.json({ items: await svc.klass.listMembers(c.req.param('id')), class: cls })
  })

  /** 添加成员（容量约束在 repo 层校验） */
  app.post('/:id/members', requirePerm('class:write'), async (c) => {
    const body = await jsonBody<{ studentId: string }>(c)
    if (!body?.studentId) return c.json({ error: 'missing_student' }, 400)
    const result = await svc.klass.addMember(c.req.param('id'), body.studentId)
    if (!result.ok) return c.json({ error: 'add_failed', message: result.message }, 409)
    return c.json({ ok: true })
  })

  /** 移除成员 */
  app.delete('/:id/members/:studentId', requirePerm('class:write'), async (c) => {
    const ok = await svc.klass.removeMember(c.req.param('id'), c.req.param('studentId'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  /** 班级课表（该班全部排课） */
  app.get('/:id/schedules', requirePerm('schedule:read'), async (c) => {
    return c.json({ items: await svc.schedule.listByClass(c.req.param('id')) })
  })

  return app
}
