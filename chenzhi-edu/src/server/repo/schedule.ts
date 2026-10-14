import { and, eq, inArray, lte, gte, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository } from './base.js'
import type { ScheduleDto, ScheduleInput } from '../../shared/domain.js'

/**
 * 排课仓储 + 冲突检测。
 *
 * 冲突规则（同一「教师」或同一「教室」在重叠时段不能有两节课）：
 * 两个排课冲突 ⟺ 同 weekday 且 节次区间 [start,end] 相交 且 教学周段 [weekStart,weekEnd] 相交
 * 且（同教师 或 同教室）。教师维度需经班级 → 教师关联。
 */
export class ScheduleRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(s: any): ScheduleDto {
    return {
      id: s.id, classId: s.classId, className: s.className, courseName: s.courseName,
      courseColor: Number(s.courseColor ?? s._courseColor ?? 1), teacherName: s.teacherName,
      weekday: Number(s.weekday), startPeriod: Number(s.startPeriod), endPeriod: Number(s.endPeriod),
      weekStart: Number(s.weekStart), weekEnd: Number(s.weekEnd), room: s.room,
    }
  }

  /** 节次区间是否相交（闭区间） */
  private periodsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart <= bEnd && bStart <= aEnd
  }

  /** 教学周段是否相交 */
  private weeksOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart <= bEnd && bStart <= aEnd
  }

  /**
   * 检测冲突：返回冲突的已有排课描述（空数组 = 无冲突）。
   * excludeId 用于更新时排除自身。
   */
  async detectConflict(input: ScheduleInput & { teacherId?: string | null }, excludeId?: string): Promise<string[]> {
    const t = this.t
    // 取同 weekday 的全部排课（带班级/教师信息）
    const sameDay = await this.db.select({
      id: t.schedules.id, classId: t.schedules.classId, weekday: t.schedules.weekday,
      startPeriod: t.schedules.startPeriod, endPeriod: t.schedules.endPeriod,
      weekStart: t.schedules.weekStart, weekEnd: t.schedules.weekEnd, room: t.schedules.room,
      className: t.classes.name, teacherId: t.classes.teacherId, teacherName: t.teachers.name,
      classRoom: t.classes.room,
    }).from(t.schedules)
      .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
      .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
      .where(eq(t.schedules.weekday, input.weekday))

    const conflicts: string[] = []
    for (const s of sameDay) {
      if (excludeId && s.id === excludeId) continue
      if (!this.periodsOverlap(input.startPeriod, input.endPeriod, Number(s.startPeriod), Number(s.endPeriod))) continue
      if (!this.weeksOverlap(input.weekStart, input.weekEnd, Number(s.weekStart), Number(s.weekEnd))) continue

      const sameRoom = input.room && s.room && input.room === s.room
      // 教师冲突：目标班级教师 vs 已有排课班级教师
      const sameTeacher = input.teacherId && s.teacherId && input.teacherId === s.teacherId
      if (sameRoom) conflicts.push(`教室「${s.room}」在${s.className}已被占用`)
      else if (sameTeacher) conflicts.push(`教师「${s.teacherName}」在${s.className}已有排课`)
    }
    return conflicts
  }

  async create(input: ScheduleInput & { teacherId?: string | null }): Promise<{ ok: boolean; conflicts?: string[]; schedule?: ScheduleDto }> {
    const conflicts = await this.detectConflict(input)
    if (conflicts.length) return { ok: false, conflicts }
    const rows = await this.db.insert(this.t.schedules).values({
      classId: input.classId, weekday: input.weekday, startPeriod: input.startPeriod,
      endPeriod: input.endPeriod, weekStart: input.weekStart ?? 1, weekEnd: input.weekEnd ?? 20,
      room: input.room, createdAt: this.now(),
    }).returning()
    const dto = await this.getFullById(rows[0].id)
    return { ok: true, schedule: dto ?? undefined }
  }

  async update(id: string, input: Partial<ScheduleInput> & { teacherId?: string | null }): Promise<{ ok: boolean; conflicts?: string[] }> {
    const existing = await this.db.select().from(this.t.schedules).where(eq(this.t.schedules.id, id)).limit(1)
    if (!existing[0]) return { ok: false, conflicts: ['排课不存在'] }
    const merged = { ...existing[0], ...input } as ScheduleInput & { teacherId?: string | null }
    const conflicts = await this.detectConflict(merged, id)
    if (conflicts.length) return { ok: false, conflicts }
    await this.db.update(this.t.schedules).set(input).where(eq(this.t.schedules.id, id))
    return { ok: true }
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.schedules).where(eq(this.t.schedules.id, id)).returning()
    return rows.length > 0
  }

  async getFullById(id: string): Promise<ScheduleDto | null> {
    const t = this.t
    const rows = await this.db.select({
      id: t.schedules.id, classId: t.schedules.classId, weekday: t.schedules.weekday,
      startPeriod: t.schedules.startPeriod, endPeriod: t.schedules.endPeriod,
      weekStart: t.schedules.weekStart, weekEnd: t.schedules.weekEnd, room: t.schedules.room,
      className: t.classes.name, courseName: t.courses.name, courseColor: t.courses.colorIndex,
      teacherName: t.teachers.name,
    }).from(t.schedules)
      .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
      .leftJoin(t.courses, eq(t.classes.courseId, t.courses.id))
      .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
      .where(eq(t.schedules.id, id)).limit(1)
    return rows[0] ? this.toDto(rows[0]) : null
  }

  /** 全校课表（周视图）：可按 week 过滤教学周段 */
  async weekTimetable(week?: number, teacherId?: string): Promise<ScheduleDto[]> {
    const t = this.t
    const conds: any[] = []
    if (week) conds.push(and(lte(t.schedules.weekStart, week), gte(t.schedules.weekEnd, week)))
    if (teacherId) conds.push(eq(t.classes.teacherId, teacherId))
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where
      ? this.db.select({
          id: t.schedules.id, classId: t.schedules.classId, weekday: t.schedules.weekday,
          startPeriod: t.schedules.startPeriod, endPeriod: t.schedules.endPeriod,
          weekStart: t.schedules.weekStart, weekEnd: t.schedules.weekEnd, room: t.schedules.room,
          className: t.classes.name, courseName: t.courses.name, courseColor: t.courses.colorIndex,
          teacherName: t.teachers.name,
        }).from(t.schedules)
          .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
          .leftJoin(t.courses, eq(t.classes.courseId, t.courses.id))
          .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
          .where(where)
      : this.db.select({
          id: t.schedules.id, classId: t.schedules.classId, weekday: t.schedules.weekday,
          startPeriod: t.schedules.startPeriod, endPeriod: t.schedules.endPeriod,
          weekStart: t.schedules.weekStart, weekEnd: t.schedules.weekEnd, room: t.schedules.room,
          className: t.classes.name, courseName: t.courses.name, courseColor: t.courses.colorIndex,
          teacherName: t.teachers.name,
        }).from(t.schedules)
          .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
          .leftJoin(t.courses, eq(t.classes.courseId, t.courses.id))
          .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
    ).orderBy(t.schedules.weekday, t.schedules.startPeriod)
    return rows.map((r: any) => this.toDto(r))
  }

  async listByClass(classId: string): Promise<ScheduleDto[]> {
    const t = this.t
    const rows = await this.db.select({
      id: t.schedules.id, classId: t.schedules.classId, weekday: t.schedules.weekday,
      startPeriod: t.schedules.startPeriod, endPeriod: t.schedules.endPeriod,
      weekStart: t.schedules.weekStart, weekEnd: t.schedules.weekEnd, room: t.schedules.room,
      className: t.classes.name, courseName: t.courses.name, courseColor: t.courses.colorIndex,
      teacherName: t.teachers.name,
    }).from(t.schedules)
      .leftJoin(t.classes, eq(t.schedules.classId, t.classes.id))
      .leftJoin(t.courses, eq(t.classes.courseId, t.courses.id))
      .leftJoin(t.teachers, eq(t.classes.teacherId, t.teachers.id))
      .where(eq(t.schedules.classId, classId))
      .orderBy(t.schedules.weekday, t.schedules.startPeriod)
    return rows.map((r: any) => this.toDto(r))
  }
}
