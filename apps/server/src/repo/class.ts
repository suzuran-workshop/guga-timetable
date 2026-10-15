import { and, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, normalizePage, type PageQuery } from './base.js'
import type { ClassDto, ClassInput, ClassStatus, ScheduleDto } from '@guga/shared'

/** 班级仓储：聚合课程、教师、排课、在读人数与成员。 */
export class ClassRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(row: any, schedules: ScheduleDto[] = [], enrolled = 0): ClassDto {
    return {
      id: row.id,
      name: row.name,
      courseId: row.courseId,
      courseName: row._courseName ?? '',
      courseColor: Number(row._courseColor ?? 1),
      teacherId: row.teacherId,
      teacherName: row._teacherName ?? null,
      room: row.room,
      capacity: Number(row.capacity),
      enrolled,
      startDate: row.startDate,
      status: row.status,
      remark: row.remark,
      schedules,
    }
  }

  /** 联表查询主体（课程名/色 + 教师名） */
  private selectWithJoins() {
    const t = this.t
    return this.db
      .select({
        id: t.classes.id, name: t.classes.name, courseId: t.classes.courseId,
        teacherId: t.classes.teacherId, room: t.classes.room, capacity: t.classes.capacity,
        startDate: t.classes.startDate, status: t.classes.status, remark: t.classes.remark,
        createdAt: t.classes.createdAt,
        _courseName: t.courses.name, _courseColor: t.courses.colorIndex,
        _teacherName: t.teachers.name,
      })
      .from(t.classes)
      .leftJoin(t.courses, eq(t.classes.courseId, t.courses.id))
      .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
  }

  async list(q: PageQuery & { status?: ClassStatus; courseId?: string }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.status) conds.push(eq(t.classes.status, q.status))
    if (q.courseId) conds.push(eq(t.classes.courseId, q.courseId))
    if (q.keyword) {
      const kw = `%${q.keyword}%`
      conds.push(or(like(t.classes.name, kw), like(t.classes.room, kw)))
    }
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.selectWithJoins().where(where) : this.selectWithJoins())
      .orderBy(desc(t.classes.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.classes).where(where)
      : this.db.select({ c: count() }).from(t.classes))

    const ids = rows.map((r: any) => r.id)
    const { enrolledMap, schedulesMap } = await this.enrich(ids)
    return {
      items: rows.map((r: any) => this.toDto(r, schedulesMap[r.id] ?? [], enrolledMap[r.id] ?? 0)),
      total: Number(totalRow[0]?.c ?? 0), page, pageSize,
    }
  }

  /** 批量取在读人数 + 排课 */
  private async enrich(classIds: string[]) {
    const t = this.t
    const enrolledMap: Record<string, number> = {}
    const schedulesMap: Record<string, ScheduleDto[]> = {}
    if (!classIds.length) return { enrolledMap, schedulesMap }

    const members = await this.db.select({ classId: t.classMembers.classId, c: count() })
      .from(t.classMembers).where(inArray(t.classMembers.classId, classIds)).groupBy(t.classMembers.classId)
    for (const m of members) enrolledMap[m.classId] = Number(m.c)

    const scheds = await this.db.select({
      id: t.schedules.id, classId: t.schedules.classId, weekday: t.schedules.weekday,
      startPeriod: t.schedules.startPeriod, endPeriod: t.schedules.endPeriod,
      weekStart: t.schedules.weekStart, weekEnd: t.schedules.weekEnd, room: t.schedules.room,
      className: t.classes.name, courseName: t.courses.name, courseColor: t.courses.colorIndex,
      teacherId: t.teachers.id, teacherName: t.teachers.name,
    }).from(t.schedules)
      .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
      .leftJoin(t.courses, eq(t.classes.courseId, t.courses.id))
      .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
      .where(inArray(t.schedules.classId, classIds))
      .orderBy(t.schedules.weekday, t.schedules.startPeriod)
    for (const s of scheds) {
      const dto: ScheduleDto = {
        id: s.id, classId: s.classId, className: s.className, courseName: s.courseName,
        courseColor: Number(s.courseColor), teacherId: s.teacherId ?? null, teacherName: s.teacherName,
        weekday: Number(s.weekday), startPeriod: Number(s.startPeriod), endPeriod: Number(s.endPeriod),
        weekStart: Number(s.weekStart), weekEnd: Number(s.weekEnd), room: s.room,
      }
      ;(schedulesMap[s.classId] ??= []).push(dto)
    }
    return { enrolledMap, schedulesMap }
  }

  async getById(id: string): Promise<ClassDto | null> {
    const rows = await this.selectWithJoins().where(eq(this.t.classes.id, id)).limit(1)
    if (!rows[0]) return null
    const { enrolledMap, schedulesMap } = await this.enrich([id])
    return this.toDto(rows[0], schedulesMap[id] ?? [], enrolledMap[id] ?? 0)
  }

  async create(input: ClassInput): Promise<ClassDto> {
    const now = this.now()
    const rows = await this.db.insert(this.t.classes).values({
      ...input, status: input.status ?? 'recruiting', capacity: input.capacity ?? 30,
      createdAt: now, updatedAt: now,
    }).returning()
    return (await this.getById(rows[0].id))!
  }

  async update(id: string, patch: Partial<ClassInput>): Promise<ClassDto | null> {
    await this.db.update(this.t.classes).set({ ...patch, updatedAt: this.now() })
      .where(eq(this.t.classes.id, id))
    return this.getById(id)
  }

  async remove(id: string): Promise<boolean> {
    const t = this.t
    await this.db.delete(t.classMembers).where(eq(t.classMembers.classId, id))
    await this.db.delete(t.schedules).where(eq(t.schedules.classId, id))
    const rows = await this.db.delete(t.classes).where(eq(t.classes.id, id)).returning()
    return rows.length > 0
  }

  // ---- 成员管理 ----

  async addMember(classId: string, studentId: string): Promise<{ ok: boolean; message?: string }> {
    const t = this.t
    const cls = await this.db.select().from(t.classes).where(eq(t.classes.id, classId)).limit(1)
    if (!cls[0]) return { ok: false, message: '班级不存在' }
    const enrolled = await this.db.select({ c: count() }).from(t.classMembers).where(eq(t.classMembers.classId, classId))
    if (Number(enrolled[0]?.c ?? 0) >= Number(cls[0].capacity)) return { ok: false, message: '班级已满员' }
    const exists = await this.db.select().from(t.classMembers)
      .where(and(eq(t.classMembers.classId, classId), eq(t.classMembers.studentId, studentId))).limit(1)
    if (exists[0]) return { ok: false, message: '学员已在班级中' }
    await this.db.insert(t.classMembers).values({ classId, studentId, joinedAt: this.now() })
    return { ok: true }
  }

  async removeMember(classId: string, studentId: string): Promise<boolean> {
    const t = this.t
    const rows = await this.db.delete(t.classMembers)
      .where(and(eq(t.classMembers.classId, classId), eq(t.classMembers.studentId, studentId))).returning()
    return rows.length > 0
  }

  async listMembers(classId: string) {
    const t = this.t
    const rows = await this.db.select({
      id: t.students.id, name: t.students.name, studentNo: t.students.studentNo,
      phone: t.students.phone, balanceLessons: t.students.balanceLessons, status: t.students.status,
      joinedAt: t.classMembers.joinedAt,
    }).from(t.classMembers)
      .innerJoin(t.students, eq(t.classMembers.studentId, t.students.id))
      .where(eq(t.classMembers.classId, classId))
      .orderBy(desc(t.classMembers.joinedAt))
    return rows.map((r: any) => ({ ...r, joinedAt: Number(r.joinedAt) }))
  }

  async listStudentClasses(studentId: string) {
    const t = this.t
    const rows = await this.selectWithJoins()
      .where(sql`${t.classes.id} IN (SELECT ${t.classMembers.classId} FROM ${t.classMembers} WHERE ${t.classMembers.studentId} = ${studentId})`)
      .orderBy(desc(t.classes.createdAt))
    const ids = rows.map((r: any) => r.id)
    const { schedulesMap, enrolledMap } = await this.enrich(ids)
    return rows.map((r: any) => this.toDto(r, schedulesMap[r.id] ?? [], enrolledMap[r.id] ?? 0))
  }
}
