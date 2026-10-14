import { Hono } from 'hono'
import { courseSchema } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { createCrudRoutes, baseQuery } from './crud.js'
import { requirePerm } from './guards.js'

/** 课程路由：标准 CRUD + 全量选项。 */
export function courseRoutes(svc: Services): Hono {
  const app = new Hono()

  const crud = createCrudRoutes({
    resource: '课程',
    permBase: 'course',
    schema: courseSchema,
    repo: svc.course,
    parseListQuery: (c) => {
      const u = new URL(c.req.url)
      return { ...baseQuery(c), status: u.searchParams.get('status') ?? undefined }
    },
  })
  app.route('/', crud)

  /** 全量课程（下拉选择用） */
  app.get('/options/all', requirePerm('course:read'), async (c) => {
    return c.json({ items: await svc.course.getAll() })
  })

  return app
}
