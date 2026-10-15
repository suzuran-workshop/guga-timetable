import { Hono } from 'hono'
import { gradeSchema } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { createCrudRoutes, baseQuery } from './crud.js'
import { requirePerm } from './guards.js'

/** 成绩路由：标准 CRUD + 平均分。 */
export function gradeRoutes(svc: Services): Hono {
  const app = new Hono()

  const crud = createCrudRoutes({
    resource: '成绩',
    permBase: 'grade',
    schema: gradeSchema,
    repo: svc.grade,
    parseListQuery: (c) => {
      const u = new URL(c.req.url)
      return {
        ...baseQuery(c),
        studentId: u.searchParams.get('studentId') ?? undefined,
        classId: u.searchParams.get('classId') ?? undefined,
        examName: u.searchParams.get('examName') ?? undefined,
      }
    },
  })
  app.route('/', crud)

  /** 学员平均分 */
  app.get('/stats/avg', requirePerm('grade:read'), async (c) => {
    const u = new URL(c.req.url)
    const studentId = u.searchParams.get('studentId')
    if (!studentId) return c.json({ error: 'missing_student' }, 400)
    return c.json({ studentId, avgScore: await svc.grade.avgScore(studentId) })
  })

  return app
}
