import { Hono } from 'hono'
import { attendanceSchema, AttendanceStatus, LESSON_CONSUMING } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { requirePerm, jsonBody, currentUser } from './guards.js'
import { baseQuery } from './crud.js'

/** 考勤路由：列表 + 批量点名（联动课时扣减）+ 撤销。 */
export function attendanceRoutes(svc: Services): Hono {
  const app = new Hono()

  app.get('/', requirePerm('attendance:read'), async (c) => {
    const u = new URL(c.req.url)
    const result = await svc.attendance.list({
      ...baseQuery(c),
      date: u.searchParams.get('date') ?? undefined,
      scheduleId: u.searchParams.get('scheduleId') ?? undefined,
      studentId: u.searchParams.get('studentId') ?? undefined,
      status: (u.searchParams.get('status') as AttendanceStatus) ?? undefined,
    })
    return c.json(result)
  })

  /**
   * 点名登记：为某排课 + 日期批量写入考勤。
   * body: { scheduleId, lessonDate, marks: [{ studentId, status, consumedLessons?, remark? }] }
   * 出勤/迟到/补课会计入课时消耗，repo 层联动扣减 balanceLessons；改判自动回滚差额。
   */
  app.post('/mark', requirePerm('attendance:write'), async (c) => {
    const body = await jsonBody<{
      scheduleId: string; lessonDate: string
      marks: { studentId: string; status: AttendanceStatus; consumedLessons?: number; remark?: string }[]
    }>(c)
    if (!body?.scheduleId || !body?.lessonDate || !Array.isArray(body.marks)) {
      return c.json({ error: 'invalid_body', message: '需要 scheduleId / lessonDate / marks[]' }, 400)
    }
    // 校验每条 status 合法
    for (const m of body.marks) {
      if (!AttendanceStatus.includes(m.status)) {
        return c.json({ error: 'validation_failed', message: `非法考勤状态：${m.status}` }, 422)
      }
    }
    const results = await svc.attendance.markBatch(body.scheduleId, body.lessonDate, body.marks, currentUser(c)?.id)
    return c.json({ ok: true, count: results.length, results })
  })

  /** 待点名清单：某排课 + 日期的班级成员当前考勤状态（前端点名页用） */
  app.get('/roster', requirePerm('attendance:read'), async (c) => {
    const u = new URL(c.req.url)
    const scheduleId = u.searchParams.get('scheduleId')
    const lessonDate = u.searchParams.get('date')
    if (!scheduleId || !lessonDate) return c.json({ error: 'missing_params', message: '需要 scheduleId 与 date' }, 400)
    const sched = await svc.schedule.getFullById(scheduleId)
    if (!sched) return c.json({ error: 'schedule_not_found' }, 404)
    const members = await svc.klass.listMembers(sched.classId)
    const existing = await svc.attendance.list({ scheduleId, date: lessonDate, pageSize: 200 })
    const markMap = new Map<string, { id: string; status: string }>(
      existing.items.map((a: { studentId: string; id: string; status: string }) => [a.studentId, { id: a.id, status: a.status }]),
    )
    const roster = members.map((m: { id: string; name: string; studentNo: string; balanceLessons: number }) => ({
      studentId: m.id,
      studentName: m.name,
      studentNo: m.studentNo,
      balanceLessons: Number(m.balanceLessons),
      currentStatus: markMap.get(m.id)?.status ?? null,
      currentId: markMap.get(m.id)?.id ?? null,
    }))
    return c.json({ schedule: sched, lessonDate, roster })
  })

  /** 撤销单条考勤（回滚已扣课时） */
  app.delete('/:id', requirePerm('attendance:write'), async (c) => {
    const ok = await svc.attendance.remove(c.req.param('id'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  return app
}
