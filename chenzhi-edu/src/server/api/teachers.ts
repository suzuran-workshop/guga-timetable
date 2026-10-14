import { Hono } from 'hono'
import { teacherSchema } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { createCrudRoutes, baseQuery } from './crud.js'
import { requirePerm } from './guards.js'

/** 教师路由：标准 CRUD + 教师课表。 */
export function teacherRoutes(svc: Services): Hono {
  const app = new Hono()

  const crud = createCrudRoutes({
    resource: '教师',
    permBase: 'teacher',
    schema: teacherSchema,
    repo: svc.teacher,
    parseListQuery: (c) => {
      const u = new URL(c.req.url)
      return { ...baseQuery(c), status: u.searchParams.get('status') ?? undefined }
    },
  })
  app.route('/', crud)

  /** 全量教师（下拉选择用，不分页） */
  app.get('/options/all', requirePerm('teacher:read'), async (c) => {
    const all = await svc.teacher.list({ pageSize: 200 })
    return c.json({ items: all.items })
  })

  /** 教师个人课表（按教师过滤的周视图） */
  app.get('/:id/timetable', requirePerm('schedule:read'), async (c) => {
    const u = new URL(c.req.url)
    const week = u.searchParams.get('week') ? Number(u.searchParams.get('week')) : undefined
    const items = await svc.schedule.weekTimetable({ week, teacherId: c.req.param('id') })
    return c.json({ items })
  })

  return app
}
