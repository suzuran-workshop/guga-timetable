import { Hono } from 'hono'
import { studentSchema } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { createCrudRoutes, baseQuery } from './crud.js'
import { requirePerm, currentUser } from './guards.js'

/** 学员路由：标准 CRUD + 课时余额 + 个人档案聚合。 */
export function studentRoutes(svc: Services): Hono {
  const app = new Hono()

  const crud = createCrudRoutes({
    resource: '学员',
    permBase: 'student',
    schema: studentSchema,
    repo: svc.student,
    parseListQuery: (c) => {
      const u = new URL(c.req.url)
      return { ...baseQuery(c), status: u.searchParams.get('status') ?? undefined }
    },
    onCreateExtra: (c) => [currentUser(c)?.id],
  })
  app.route('/', crud)

  /** 低课时余额预警列表（<= threshold） */
  app.get('/alerts/low-balance', requirePerm('student:read'), async (c) => {
    const threshold = Number(new URL(c.req.url).searchParams.get('threshold') ?? 3)
    return c.json({ items: await svc.student.lowBalance(threshold) })
  })

  /** 手动调整课时余额（教务/财务用，如赠送课时） */
  app.post('/:id/balance', requirePerm('student:write'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const delta = Number(body?.delta ?? 0)
    if (!Number.isFinite(delta) || delta === 0) return c.json({ error: 'invalid_delta' }, 400)
    const student = await svc.student.getById(c.req.param('id'))
    if (!student) return c.json({ error: 'not_found' }, 404)
    const balance = await svc.student.adjustBalance(student.id, delta)
    return c.json({ ok: true, balanceLessons: balance })
  })

  /** 学员个人档案：基本信息 + 班级 + 考勤 + 成绩 + 订单 */
  app.get('/:id/profile', requirePerm('student:read'), async (c) => {
    const id = c.req.param('id')
    const student = await svc.student.getById(id)
    if (!student) return c.json({ error: 'not_found' }, 404)
    const [classes, attendance, grades, orders, avgScore] = await Promise.all([
      svc.klass.listStudentClasses(id),
      svc.attendance.listByStudent(id),
      svc.grade.listByStudent(id),
      svc.order.list({ studentId: id, pageSize: 20 }),
      svc.grade.avgScore(id),
    ])
    return c.json({ student, classes, attendance, grades, orders: orders.items, avgScore })
  })

  return app
}
