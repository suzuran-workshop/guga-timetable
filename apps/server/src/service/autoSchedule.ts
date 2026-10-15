import type { Services } from '../repo/index.js'
import { createLogger } from '@homurajs/core'
import {
  PERIODS,
  type AutoScheduleRequest,
  type AutoScheduleResult,
  type ScheduleInput,
  type ScheduleSlot,
} from '@guga/shared'

/**
 * 自动派课（贪心 + 回溯）。
 *
 * 目标：为给定班级批量生成排课，满足每班「每周 lessonsPerWeek 次课」的需求，
 * 且全程无冲突（复用 ScheduleRepo.detectConflict 的三维相交判定：教室∪教师 × 节次 × 周段）。
 *
 * 为什么用贪心+回溯而非约束求解器：
 * - 教务规模（几十班、每天十几节）下，回溯搜索足够快且可解释；
 * - 引入 CSP 求解器是重依赖，收益不抵复杂度（见 ADR）。
 *
 * 算法：
 *   把每个班需要的 N 次课拆成 N 个「待排任务」。逐个任务尝试所有候选时段
 *   (weekday × 连续节次窗口)，用冲突检测筛掉不可行的；可行则占位（写入 pending 集合 + 真实建排课）。
 *   若某任务无任何可行时段 → 回溯：撤销上一个任务的占位，换它的下一个候选时段，再重试当前任务。
 *   「占位」用内存中的虚拟排课集合参与冲突检测，避免每次都查库；最终成功的一批才真正落库。
 */

/** 候选时段（连续节次窗口）。契约定义在 @guga/shared，此处仅取本地别名。 */
type Slot = ScheduleSlot

/** 一个待排任务 */
interface Task { classId: string; className: string; teacherId: string | null; room: string | null; index: number }

export class AutoScheduleService {
  private logger = createLogger().child('auto-schedule')
  constructor(private svc: Services) {}

  /** 枚举所有候选时段（weekday × 连续 periodsPerLesson 节的窗口）。 */
  private candidateSlots(req: Required<Pick<AutoScheduleRequest, 'weekdays'>> & AutoScheduleRequest, periodsPerLesson: number): Slot[] {
    const weekdays = req.weekdays
    const maxPeriod = Math.max(...PERIODS.map((p) => p.index))
    const allowedStarts = req.allowedStartPeriods ?? PERIODS.map((p) => p.index)
    const slots: Slot[] = []
    for (const wd of weekdays) {
      for (const start of allowedStarts) {
        const end = start + periodsPerLesson - 1
        if (end > maxPeriod) continue
        // 节次窗口必须真实存在（连续）
        if (!PERIODS.find((p) => p.index === start) || !PERIODS.find((p) => p.index === end)) continue
        slots.push({ weekday: wd, startPeriod: start, endPeriod: end })
      }
    }
    // 排序：**节次优先，再按星期**（period-major）。
    // 这样同一班级的多次课会优先落在「不同星期的同一时段」（如周一P1-2 + 周三P1-2），
    // 而非挤在同一天——符合教务「每周课次分散到不同天」的排课习惯。
    // 同班冲突约束保证同一天同一时段不会重复，故 period-major 天然把同班课次推向不同天。
    // 结果对输入顺序稳定、可复现。
    slots.sort((a, b) => a.startPeriod - b.startPeriod || a.weekday - b.weekday)
    return slots
  }

  async run(reqIn: AutoScheduleRequest, createdBy?: string): Promise<AutoScheduleResult> {
    // lessonsPerWeek/periodsPerLesson 是必填项，直接取；其余可选字段兜底缺省（放在 spread 之后覆盖）。
    const req: AutoScheduleRequest & { weekdays: number[]; weekStart: number; weekEnd: number } = {
      rooms: [], maxBacktracks: 20000,
      ...reqIn,
      weekdays: reqIn.weekdays?.length ? reqIn.weekdays : [1, 2, 3, 4, 5],
      weekStart: reqIn.weekStart ?? 1,
      weekEnd: reqIn.weekEnd ?? 20,
    }

    // 1. 展开任务：每班 lessonsPerWeek 个
    const tasks: Task[] = []
    for (const cid of req.classIds) {
      const cls = await this.svc.klass.getById(cid)
      if (!cls) { this.logger.warn('班级不存在，跳过', { classId: cid }); continue }
      for (let i = 0; i < req.lessonsPerWeek; i++) {
        tasks.push({ classId: cid, className: cls.name, teacherId: cls.teacherId, room: cls.room, index: i })
      }
    }
    if (!tasks.length) return { ok: false, placed: [], failed: [], backtracks: 0, message: '没有可排课的班级' }

    const slots = this.candidateSlots(req, req.periodsPerLesson)
    if (!slots.length) return { ok: false, placed: [], failed: [], backtracks: 0, message: '无可用时段（检查节次/星期范围）' }

    // 2. 已有排课（作为固定障碍参与冲突检测）——按 weekday 分组缓存
    const existingByWeekday = await this.loadExistingByWeekday()

    // 3. 回溯搜索：assignment[k] = 第 k 个任务选用的 slot 下标（-1 未定）
    const assignment: number[] = new Array(tasks.length).fill(-1)
    // placedRooms[k] = 第 k 个任务分配到的教室（room 池时）
    const placedRoom: (string | null)[] = new Array(tasks.length).fill(null)
    // 本次搜索中已占位的虚拟排课（参与冲突检测）：按 weekday 分组
    const pendingByWeekday: Record<number, VirtualSched[]> = {}

    let backtracks = 0
    const maxBacktracks = req.maxBacktracks!

    interface VirtualSched {
      classId: string; teacherId: string | null; room: string | null
      weekday: number; startPeriod: number; endPeriod: number; weekStart: number; weekEnd: number
    }

    /** 冲突判定：与已有排课 + 已占位虚拟排课 比，教室∪教师 三维相交 */
    const conflictsFor = (task: Task, slot: Slot, room: string | null): string | null => {
      const cands: VirtualSched[] = [
        ...(existingByWeekday[slot.weekday] ?? []),
        ...(pendingByWeekday[slot.weekday] ?? []),
      ]
      for (const s of cands) {
        const periodOverlap = slot.startPeriod <= s.endPeriod && s.startPeriod <= slot.endPeriod
        if (!periodOverlap) continue
        // 周段：本次都用 req.weekStart~weekEnd，与已有 s.weekStart~weekEnd 判相交
        const weekOverlap = req.weekStart <= s.weekEnd && s.weekStart <= req.weekEnd
        if (!weekOverlap) continue
        if (room && s.room && room === s.room) return `教室「${room}」冲突`
        if (task.teacherId && s.teacherId && task.teacherId === s.teacherId) return `教师冲突`
        // 同一班级不能同时上两节课（同班冲突）
        if (task.classId === s.classId) return '同班时段冲突'
      }
      return null
    }

    /** 为任务在指定 slot 找可用教室（班级自带教室优先，否则从池里挑不冲突的） */
    const pickRoom = (task: Task, slot: Slot): string | null | undefined => {
      if (task.room) {
        // 班级固定教室：冲突则不可行
        return conflictsFor(task, slot, task.room) ? undefined : task.room
      }
      const pool = req.rooms ?? []
      if (!pool.length) {
        // 无教室池：只判教师/同班冲突（room=null）
        return conflictsFor(task, slot, null) ? undefined : null
      }
      for (const room of pool) {
        if (!conflictsFor(task, slot, room)) return room
      }
      return undefined // 所有教室都冲突
    }

    const place = (k: number, slotIdx: number, room: string | null) => {
      const task = tasks[k]
      const slot = slots[slotIdx]
      const v: VirtualSched = {
        classId: task.classId, teacherId: task.teacherId, room,
        weekday: slot.weekday, startPeriod: slot.startPeriod, endPeriod: slot.endPeriod,
        weekStart: req.weekStart, weekEnd: req.weekEnd,
      }
      ;(pendingByWeekday[slot.weekday] ??= []).push(v)
      assignment[k] = slotIdx
      placedRoom[k] = room
    }

    const unplace = (k: number) => {
      const slotIdx = assignment[k]
      if (slotIdx < 0) return
      const slot = slots[slotIdx]
      const arr = pendingByWeekday[slot.weekday]
      if (arr) {
        // 移除该任务占位（按引用匹配最后一条同 class 的）
        const i = arr.findIndex((s) => s.classId === tasks[k].classId && s.startPeriod === slot.startPeriod && s.weekday === slot.weekday)
        if (i >= 0) arr.splice(i, 1)
      }
      assignment[k] = -1
      placedRoom[k] = null
    }

    // 回溯主循环：k 为当前任务指针；startSlot[k] 记录下次从哪个 slot 试起
    const startSlot: number[] = new Array(tasks.length).fill(0)
    let k = 0
    let exhausted = false
    while (k < tasks.length) {
      if (backtracks > maxBacktracks) { this.logger.warn('回溯超上限，提前终止', { backtracks, k }); break }
      const task = tasks[k]
      let placedThis = false
      for (let si = startSlot[k]; si < slots.length; si++) {
        const room = pickRoom(task, slots[si])
        if (room === undefined) continue
        place(k, si, room)
        startSlot[k] = si + 1 // 下次回溯到本任务时从 si+1 试
        placedThis = true
        k++
        break
      }
      if (!placedThis) {
        // 当前任务无解 → 回溯
        startSlot[k] = 0
        k--
        if (k < 0) { exhausted = true; break }
        backtracks++
        unplace(k)
      }
    }

    // 4. 落库：全成功才持久化（all-or-nothing）。搜索未完整完成 → 一节都不落库，全部记为失败。
    const placed: AutoScheduleResult['placed'] = []
    const failed: AutoScheduleResult['failed'] = []
    const searchComplete = !exhausted && k >= tasks.length

    if (searchComplete) {
      for (let i = 0; i < tasks.length; i++) {
        const slotIdx = assignment[i]
        if (slotIdx < 0) continue
        const task = tasks[i]
        const slot = slots[slotIdx]
        const room = placedRoom[i]
        const input: ScheduleInput & { teacherId: string | null } = {
          classId: task.classId, weekday: slot.weekday,
          startPeriod: slot.startPeriod, endPeriod: slot.endPeriod,
          weekStart: req.weekStart, weekEnd: req.weekEnd, room: room ?? undefined,
          teacherId: task.teacherId,
        }
        const res = await this.svc.schedule.create(input)
        if (res.ok) {
          placed.push({ classId: task.classId, className: task.className, slot, room })
        } else {
          failed.push({ classId: task.classId, className: task.className, reason: (res.conflicts ?? []).join('; ') || '落库冲突' })
        }
      }
    } else {
      // all-or-nothing：搜索没排全 → 不落库，全部任务记失败（原因区分「约束过紧」与「回溯超上限」）
      const reason = exhausted || backtracks > maxBacktracks
        ? (backtracks > maxBacktracks ? `约束过紧，回溯超上限(${maxBacktracks})，已放弃` : '约束过紧，无完整可行解')
        : '约束过紧，无完整可行解'
      for (const task of tasks) {
        failed.push({ classId: task.classId, className: task.className, reason })
      }
    }

    const message = failed.length === 0 && placed.length === tasks.length
      ? `自动派课成功：${placed.length} 节课已排入（回溯 ${backtracks} 次）`
      : searchComplete
        ? `自动派课部分成功：排入 ${placed.length}/${tasks.length}，失败 ${failed.length}（回溯 ${backtracks} 次）`
        : `自动派课失败：约束过紧无完整可行解，未排入任何课（需 ${tasks.length} 节，回溯 ${backtracks} 次）。可放宽星期/节次范围、增加教室或减少每周课时后重试。`

    this.logger.info('自动派课完成', { placed: placed.length, failed: failed.length, backtracks, searchComplete })
    return { ok: failed.length === 0, placed, failed, backtracks, message }
  }

  /** 载入全部已有排课，按 weekday 分组（作为固定障碍）。 */
  private async loadExistingByWeekday(): Promise<Record<number, {
    classId: string; teacherId: string | null; room: string | null
    weekday: number; startPeriod: number; endPeriod: number; weekStart: number; weekEnd: number
  }[]>> {
    const all = await this.svc.schedule.weekTimetable({}) // 不带 week 过滤 → 全量
    const byDay: Record<number, any[]> = {}
    for (const s of all) {
      ;(byDay[s.weekday] ??= []).push({
        classId: s.classId, teacherId: s.teacherId, room: s.room,
        weekday: s.weekday, startPeriod: s.startPeriod, endPeriod: s.endPeriod,
        weekStart: s.weekStart, weekEnd: s.weekEnd,
      })
    }
    return byDay
  }
}
