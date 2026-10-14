import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository } from './base.js'
import type { ScheduleRepo } from './schedule.js'
import type { TermRepo } from './term.js'
import {
  weekOfDate, weekdayOfDate, toISODate, dateOfWeekday,
  type ExceptionAction, type LessonStatus, type ResolvedLesson,
  type ScheduleExceptionDto, type ScheduleExceptionInput, type SwapLessonsInput,
} from '../../shared/domain.js'

/**
 * 排课例外（调换课）仓储 + 单日课表解析。
 *
 * 核心算法 resolveDay(date)：
 *   1. base   = 命中该日期的循环排课（weekday 匹配 且 date 落在 weekStart~weekEnd 的教学周内）
 *   2. outExc = originalDate=该日期 的例外（该次课被 取消/调出/代课）
 *   3. inExc  = targetDate=该日期 的 moved 例外（别的日期的课调入该日期）
 *   对每个 base 排课：
 *     - 有 cancelled 例外 → status=cancelled（保留显示，划线）
 *     - 有 moved 例外     → status=moved_out（保留显示，标注调出）
 *     - 有 substituted    → status=substituted，教师覆盖为代课教师
 *     - 无例外            → status=normal
 *   对每个 inExc（moved 调入）→ 追加一条 status=moved_in 的课（节次/教室用 target*，缺省回退原排课）
 */
export class ScheduleExceptionRepo extends Repository {
  constructor(b: DbBundle, private schedules: ScheduleRepo, private terms: TermRepo) {
    super(b)
  }

  private toDto(r: any): ScheduleExceptionDto {
    return {
      id: r.id, scheduleId: r.scheduleId, originalDate: r.originalDate, action: r.action,
      targetDate: r.targetDate, targetStartPeriod: r.targetStartPeriod == null ? null : Number(r.targetStartPeriod),
      targetEndPeriod: r.targetEndPeriod == null ? null : Number(r.targetEndPeriod),
      targetRoom: r.targetRoom, teacherId: r.teacherId, reason: r.reason,
      createdBy: r.createdBy, createdAt: Number(r.createdAt),
    }
  }

  // ---- 例外 CRUD ----

  async list(opts: { originalDate?: string; targetDate?: string; scheduleId?: string } = {}): Promise<ScheduleExceptionDto[]> {
    const t = this.t
    const conds: any[] = []
    if (opts.originalDate) conds.push(eq(t.scheduleExceptions.originalDate, opts.originalDate))
    if (opts.targetDate) conds.push(eq(t.scheduleExceptions.targetDate, opts.targetDate))
    if (opts.scheduleId) conds.push(eq(t.scheduleExceptions.scheduleId, opts.scheduleId))
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where
      ? this.db.select().from(t.scheduleExceptions).where(where)
      : this.db.select().from(t.scheduleExceptions)).orderBy(desc(t.scheduleExceptions.createdAt))
    return rows.map((r: any) => this.toDto(r))
  }

  /** 某次课已有的例外（按 scheduleId + originalDate） */
  async forOccurrence(scheduleId: string, originalDate: string): Promise<ScheduleExceptionDto[]> {
    const rows = await this.db.select().from(this.t.scheduleExceptions)
      .where(and(eq(this.t.scheduleExceptions.scheduleId, scheduleId), eq(this.t.scheduleExceptions.originalDate, originalDate)))
    return rows.map((r: any) => this.toDto(r))
  }

  async create(input: ScheduleExceptionInput, createdBy?: string): Promise<ScheduleExceptionDto> {
    const rows = await this.db.insert(this.t.scheduleExceptions).values({
      scheduleId: input.scheduleId, originalDate: input.originalDate, action: input.action,
      targetDate: input.targetDate ?? null,
      targetStartPeriod: input.targetStartPeriod ?? null, targetEndPeriod: input.targetEndPeriod ?? null,
      targetRoom: input.targetRoom ?? null, teacherId: input.teacherId ?? null,
      reason: input.reason ?? null, createdBy: createdBy ?? null, createdAt: this.now(),
    }).returning()
    return this.toDto(rows[0])
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.scheduleExceptions).where(eq(this.t.scheduleExceptions.id, id)).returning()
    return rows.length > 0
  }

  /** 撤销某次课的所有例外（恢复为正常循环课） */
  async clearOccurrence(scheduleId: string, originalDate: string): Promise<number> {
    const rows = await this.db.delete(this.t.scheduleExceptions)
      .where(and(eq(this.t.scheduleExceptions.scheduleId, scheduleId), eq(this.t.scheduleExceptions.originalDate, originalDate))).returning()
    return rows.length
  }

  // ---- 单日课表解析 ----

  /** 解析某日期的实际课次（循环排课 ⊕ 例外）。 */
  async resolveDay(date: string, scope?: { teacherId?: string; classId?: string }): Promise<ResolvedLesson[]> {
    const t = this.t
    const term = await this.terms.getCurrent()
    const weekday = weekdayOfDate(date)
    const week = term ? weekOfDate(date, term.startDate, term.totalWeeks) : null

    // 1. base：命中该日期的循环排课（weekday 匹配；有学期则要求 date 在教学周范围内）
    const baseScheds = await this.schedules.weekTimetable({
      week: week ?? undefined,
      teacherId: scope?.teacherId,
      classId: scope?.classId,
    })
    // weekTimetable 已按 week 过滤周段，但还需 weekday 精确匹配该日期
    const base = baseScheds.filter((s) => s.weekday === weekday)

    // 2. outExc：该日期被变更的课
    const outExc = await this.list({ originalDate: date })
    const outMap = new Map<string, ScheduleExceptionDto[]>()
    for (const e of outExc) {
      const arr = outMap.get(e.scheduleId)
      if (arr) arr.push(e)
      else outMap.set(e.scheduleId, [e])
    }

    // 3. inExc：调入该日期的课
    const inExc = (await this.list({ targetDate: date })).filter((e) => e.action === 'moved')

    // 代课教师名解析
    const subTeacherIds = [...new Set(outExc.filter((e) => e.action === 'substituted' && e.teacherId).map((e) => e.teacherId!))]
    const inTeacherIds = [...new Set(inExc.filter((e) => e.teacherId).map((e) => e.teacherId!))]
    const teacherNames = await this.resolveTeacherNames([...subTeacherIds, ...inTeacherIds])

    const lessons: ResolvedLesson[] = []

    // base 排课逐条套用例外
    for (const s of base) {
      const excs = outMap.get(s.id) ?? []
      const cancelled = excs.find((e) => e.action === 'cancelled')
      const moved = excs.find((e) => e.action === 'moved')
      const sub = excs.find((e) => e.action === 'substituted')

      let status: LessonStatus = 'normal'
      let exceptionId: string | null = null
      let reason: string | null = null
      let teacherId = s.teacherId ?? null
      let teacherName = s.teacherName ?? null

      if (cancelled) { status = 'cancelled'; exceptionId = cancelled.id; reason = cancelled.reason }
      else if (moved) { status = 'moved_out'; exceptionId = moved.id; reason = moved.reason }
      else if (sub) {
        status = 'substituted'; exceptionId = sub.id; reason = sub.reason
        if (sub.teacherId) { teacherId = sub.teacherId; teacherName = teacherNames[sub.teacherId] ?? teacherName }
      }

      lessons.push({
        key: s.id, scheduleId: s.id, date, week, weekday,
        startPeriod: s.startPeriod, endPeriod: s.endPeriod, room: s.room,
        classId: s.classId, className: s.className, courseName: s.courseName, courseColor: s.courseColor,
        teacherId, teacherName, status, exceptionId, reason,
      })
    }

    // 调入的课（moved_in）
    for (const e of inExc) {
      // 取源排课信息（课程/班级/教师）
      const src = await this.schedules.getFullById(e.scheduleId)
      if (!src) continue
      // scope 过滤：调入课也要符合当前维度
      if (scope?.classId && src.classId !== scope.classId) continue
      const teacherId = e.teacherId ?? (src as any).teacherId ?? null
      if (scope?.teacherId && teacherId !== scope.teacherId) continue
      const teacherName = e.teacherId ? (teacherNames[e.teacherId] ?? src.teacherName) : src.teacherName
      lessons.push({
        key: `${e.scheduleId}@${date}`, scheduleId: e.scheduleId, date, week, weekday,
        startPeriod: e.targetStartPeriod ?? src.startPeriod, endPeriod: e.targetEndPeriod ?? src.endPeriod,
        room: e.targetRoom ?? src.room, classId: src.classId, className: src.className,
        courseName: src.courseName, courseColor: src.courseColor,
        teacherId, teacherName, status: 'moved_in', exceptionId: e.id, reason: e.reason,
      })
    }

    return lessons.sort((a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod)
  }

  private async resolveTeacherNames(ids: string[]): Promise<Record<string, string>> {
    if (!ids.length) return {}
    const rows = await this.db.select({ id: this.t.teachers.id, name: this.t.teachers.name })
      .from(this.t.teachers).where(inArray(this.t.teachers.id, ids))
    return Object.fromEntries(rows.map((r: any) => [r.id, r.name]))
  }

  // ---- 调换课操作 ----

  /**
   * 停课：某次课取消。幂等——已有 cancelled 例外则跳过。
   */
  async cancel(scheduleId: string, date: string, reason?: string, createdBy?: string): Promise<ScheduleExceptionDto> {
    const existing = (await this.forOccurrence(scheduleId, date)).find((e) => e.action === 'cancelled')
    if (existing) return existing
    return this.create({ scheduleId, originalDate: date, action: 'cancelled', reason }, createdBy)
  }

  /**
   * 代课：某次课换教师。幂等——已有 substituted 例外则更新教师（先删后建，保持单条）。
   */
  async substitute(scheduleId: string, date: string, teacherId: string, reason?: string, createdBy?: string): Promise<ScheduleExceptionDto> {
    const t = this.t
    const existing = (await this.forOccurrence(scheduleId, date)).find((e) => e.action === 'substituted')
    if (existing) await this.db.delete(t.scheduleExceptions).where(eq(t.scheduleExceptions.id, existing.id))
    return this.create({ scheduleId, originalDate: date, action: 'substituted', teacherId, reason }, createdBy)
  }

  /**
   * 对调两次课：A(dateA) ↔ B(dateB)。
   *
   * 语义 = 两节课**交换各自的时段（日期+节次）**，各保留自己的教室：
   *   A 的 dateA 课 → 调到 dateB，占用 B 原来的节次
   *   B 的 dateB 课 → 调到 dateA，占用 A 原来的节次
   * 实现为两条互指对方日期的 moved 例外（targetStartPeriod/EndPeriod 取对方的节次）。
   *
   * 校验：
   *   - 不能与自身对调（scheduleId+date 完全相同）
   *   - 两个 occurrence 必须真实存在（该排课在指定日期确有循环课），否则拒绝（避免建出永不解析的空例外）
   */
  async swap(input: SwapLessonsInput, createdBy?: string): Promise<{ ok: boolean; message?: string; exceptions?: ScheduleExceptionDto[] }> {
    if (input.scheduleIdA === input.scheduleIdB && input.dateA === input.dateB) {
      return { ok: false, message: '不能与自身对调' }
    }
    const sA = await this.schedules.getFullById(input.scheduleIdA)
    const sB = await this.schedules.getFullById(input.scheduleIdB)
    if (!sA || !sB) return { ok: false, message: '排课不存在' }

    // occurrence 存在性校验（weekday 匹配 + 在教学周范围内）
    const okA = await this.hasOccurrenceOn(sA, input.dateA)
    const okB = await this.hasOccurrenceOn(sB, input.dateB)
    if (!okA) return { ok: false, message: `${input.dateA} 当天没有「${sA.courseName}」的排课，无法对调` }
    if (!okB) return { ok: false, message: `${input.dateB} 当天没有「${sB.courseName}」的排课，无法对调` }

    // 清理这两次课已有的 moved/cancelled 例外，避免叠加（substituted 保留）
    const t = this.t
    await this.db.delete(t.scheduleExceptions).where(and(
      eq(t.scheduleExceptions.scheduleId, input.scheduleIdA),
      eq(t.scheduleExceptions.originalDate, input.dateA),
      inArray(t.scheduleExceptions.action, ['moved', 'cancelled']),
    ))
    await this.db.delete(t.scheduleExceptions).where(and(
      eq(t.scheduleExceptions.scheduleId, input.scheduleIdB),
      eq(t.scheduleExceptions.originalDate, input.dateB),
      inArray(t.scheduleExceptions.action, ['moved', 'cancelled']),
    ))

    // A 调到 dateB，占用 B 的节次；B 调到 dateA，占用 A 的节次。教室各自保留（targetRoom 留空 → 解析时回退源排课教室）。
    const excA = await this.create({
      scheduleId: input.scheduleIdA, originalDate: input.dateA, action: 'moved',
      targetDate: input.dateB, targetStartPeriod: sB.startPeriod, targetEndPeriod: sB.endPeriod,
      reason: input.reason,
    }, createdBy)
    const excB = await this.create({
      scheduleId: input.scheduleIdB, originalDate: input.dateB, action: 'moved',
      targetDate: input.dateA, targetStartPeriod: sA.startPeriod, targetEndPeriod: sA.endPeriod,
      reason: input.reason,
    }, createdBy)
    return { ok: true, exceptions: [excA, excB] }
  }

  /**
   * 某循环排课在指定日期是否确有一次课：weekday 匹配 且 日期落在教学周 [weekStart,weekEnd] 内。
   * 无当前学期时只校验 weekday（周段无从判定）。
   */
  private async hasOccurrenceOn(sched: { weekday: number; weekStart: number; weekEnd: number }, date: string): Promise<boolean> {
    if (weekdayOfDate(date) !== sched.weekday) return false
    const term = await this.terms.getCurrent()
    if (!term) return true
    const week = weekOfDate(date, term.startDate, term.totalWeeks)
    if (week == null) return false
    return week >= sched.weekStart && week <= sched.weekEnd
  }
}
