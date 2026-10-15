import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, normalizePage, type PageQuery } from './base.js'
import { ATTENDANCE_STATUS_LABEL, LESSON_CONSUMING } from '../../shared/domain.js'
import type { AttendanceDto, AttendanceInput, AttendanceStatus } from '../../shared/domain.js'

/**
 * 考勤仓储。核心业务：标记考勤时，若状态计入课时消耗（出勤/迟到/补课），
 * 则扣减对应学员的 balanceLessons；改判/撤销时回滚。
 */
export class AttendanceRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(r: any): AttendanceDto {
    return {
      id: r.id, scheduleId: r.scheduleId, studentId: r.studentId, studentName: r.studentName ?? r._studentName ?? '',
      lessonDate: r.lessonDate, className: r.className ?? r._className ?? '',
      status: r.status, consumedLessons: Number(r.consumedLessons), remark: r.remark,
      createdAt: Number(r.createdAt),
    }
  }

  private selectJoined() {
    const t = this.t
    return this.db.select({
      id: t.attendance.id, scheduleId: t.attendance.scheduleId, studentId: t.attendance.studentId,
      lessonDate: t.attendance.lessonDate, status: t.attendance.status,
      consumedLessons: t.attendance.consumedLessons, remark: t.attendance.remark,
      createdAt: t.attendance.createdAt, _studentName: t.students.name, _className: t.classes.name,
    }).from(t.attendance)
      .leftJoin(t.students, eq(t.attendance.studentId, t.students.id))
      .leftJoin(t.schedules, eq(t.attendance.scheduleId, t.schedules.id))
      .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
  }

  async list(q: PageQuery & { date?: string; scheduleId?: string; studentId?: string; status?: AttendanceStatus }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.date) conds.push(eq(t.attendance.lessonDate, q.date))
    if (q.scheduleId) conds.push(eq(t.attendance.scheduleId, q.scheduleId))
    if (q.studentId) conds.push(eq(t.attendance.studentId, q.studentId))
    if (q.status) conds.push(eq(t.attendance.status, q.status))
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.selectJoined().where(where) : this.selectJoined())
      .orderBy(desc(t.attendance.lessonDate), desc(t.attendance.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.attendance).where(where)
      : this.db.select({ c: count() }).from(t.attendance))
    return { items: rows.map((r: any) => this.toDto(r)), total: Number(totalRow[0]?.c ?? 0), page, pageSize }
  }

  /** 点名：为某排课 + 日期批量登记考勤（含课时扣减与回滚）。 */
  async markBatch(scheduleId: string, lessonDate: string, marks: { studentId: string; status: AttendanceStatus; consumedLessons?: number; remark?: string }[], markedBy?: string) {
    const t = this.t
    const results: { studentId: string; action: string }[] = []
    for (const m of marks) {
      const consume = LESSON_CONSUMING.includes(m.status) ? (m.consumedLessons ?? 1) : 0
      const existing = await this.db.select().from(t.attendance)
        .where(and(eq(t.attendance.scheduleId, scheduleId), eq(t.attendance.studentId, m.studentId), eq(t.attendance.lessonDate, lessonDate)))
        .limit(1)
      const oldConsume = existing[0] && LESSON_CONSUMING.includes(existing[0].status) ? Number(existing[0].consumedLessons) : 0

      if (existing[0]) {
        await this.db.update(t.attendance).set({
          status: m.status, consumedLessons: consume, remark: m.remark ?? existing[0].remark,
          markedBy, updatedAt: this.now(),
        }).where(eq(t.attendance.id, existing[0].id))
        // 课时差回滚：新消耗 - 旧消耗
        const delta = consume - oldConsume
        if (delta !== 0) await this.db.update(t.students)
          .set({ balanceLessons: this.floorAt(t.students.balanceLessons, -delta), updatedAt: this.now() })
          .where(eq(t.students.id, m.studentId))
        results.push({ studentId: m.studentId, action: 'updated' })
      } else {
        await this.db.insert(t.attendance).values({
          scheduleId, studentId: m.studentId, lessonDate, status: m.status,
          consumedLessons: consume, remark: m.remark, markedBy, createdAt: this.now(), updatedAt: this.now(),
        })
        if (consume > 0) await this.db.update(t.students)
          .set({ balanceLessons: this.floorAt(t.students.balanceLessons, -consume), updatedAt: this.now() })
          .where(eq(t.students.id, m.studentId))
        results.push({ studentId: m.studentId, action: 'created' })
      }
    }
    return results
  }

  async remove(id: string): Promise<boolean> {
    const t = this.t
    const rows = await this.db.select().from(t.attendance).where(eq(t.attendance.id, id)).limit(1)
    if (rows[0] && LESSON_CONSUMING.includes(rows[0].status)) {
      // 回滚已扣课时
      await this.db.update(t.students)
        .set({ balanceLessons: sql`${t.students.balanceLessons} + ${rows[0].consumedLessons}`, updatedAt: this.now() })
        .where(eq(t.students.id, rows[0].studentId))
    }
    const del = await this.db.delete(t.attendance).where(eq(t.attendance.id, id)).returning()
    return del.length > 0
  }

  /** 出勤率统计（近 N 天或全量）：present+late+makeup 计为到课 */
  async attendanceRate(): Promise<number> {
    const t = this.t
    const total = await this.db.select({ c: count() }).from(t.attendance)
    const totalCount = Number(total[0]?.c ?? 0)
    if (!totalCount) return 0
    const present = await this.db.select({ c: count() }).from(t.attendance)
      .where(inArray(t.attendance.status, ['present', 'late', 'makeup']))
    return Math.round((Number(present[0]?.c ?? 0) / totalCount) * 1000) / 10
  }

  /** 学员考勤记录（个人档案用） */
  async listByStudent(studentId: string) {
    const rows = await this.selectJoined().where(eq(this.t.attendance.studentId, studentId))
      .orderBy(desc(this.t.attendance.lessonDate))
    return rows.map((r: any) => this.toDto(r))
  }
}
