import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase, migrate } from '../../db/index.js'
import { initTables } from '../../db/tables.js'
import { Services } from '../../repo/index.js'
import type { DbBundle } from '../../db/index.js'

/**
 * 自动派课算法测试（贪心 + 回溯）。
 * 用内存 sqlite 建真实库，验证：可行场景零冲突、分散到不同天、尊重既有障碍、
 * 不可行场景如实失败（all-or-nothing，不落库）。
 */

let b: DbBundle
let svc: Services

async function setup() {
  b = createDatabase({ dbPath: ':memory:', databaseUrl: '' })
  await migrate(b)
  initTables(b)
  svc = new Services(b)
  await svc.term.create({ name: 'T1', startDate: '2026-08-31', endDate: '2027-01-17', totalWeeks: 20, isCurrent: true } as any)
}

async function makeClass(name: string, teacherName: string, room: string | null, code: string) {
  const tr = await svc.teacher.create({ name: teacherName, teacherNo: 'T-' + code, subjects: [] } as any)
  const co = await svc.course.create({ name: '课程' + code, code: 'C-' + code, colorIndex: 1, pricePerLesson: 100 } as any)
  const cls = await svc.klass.create({ name, courseId: co.id, teacherId: tr.id, room, capacity: 30 } as any)
  return { cls, tr, co }
}

/** 校验落库排课无任何冲突（教室/教师/同班 × 节次 × 周段） */
async function assertNoConflicts() {
  const all = await svc.schedule.weekTimetable({})
  for (const x of all) {
    for (const y of all) {
      if (x.id >= y.id) continue
      if (x.weekday !== y.weekday) continue
      const periodOverlap = x.startPeriod <= y.endPeriod && y.startPeriod <= x.endPeriod
      if (!periodOverlap) continue
      const weekOverlap = x.weekStart <= y.weekEnd && y.weekStart <= x.weekEnd
      if (!weekOverlap) continue
      const roomClash = x.room && x.room === y.room
      const teacherClash = x.teacherId && x.teacherId === y.teacherId
      const sameClass = x.classId === y.classId
      expect(roomClash || teacherClash || sameClass, `冲突: ${x.className} vs ${y.className} D${x.weekday}P${x.startPeriod}`).toBe(false)
    }
  }
}

describe('自动派课（贪心+回溯）', () => {
  beforeEach(async () => { await setup() })

  it('可行场景：多班全部排入，零冲突', async () => {
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const { cls } = await makeClass(`班${i}`, `师${i}`, `R${i}`, `c${i}`)
      ids.push(cls.id)
    }
    const r = await svc.autoSchedule.run({ classIds: ids, lessonsPerWeek: 2, periodsPerLesson: 2, weekdays: [1, 2, 3, 4, 5], rooms: [] })
    expect(r.ok).toBe(true)
    expect(r.placed.length).toBe(8)
    expect(r.failed.length).toBe(0)
    await assertNoConflicts()
  })

  it('同班多次课分散到不同星期（period-major 排序）', async () => {
    const { cls } = await makeClass('分散班', '分散师', null, 'spread')
    const r = await svc.autoSchedule.run({ classIds: [cls.id], lessonsPerWeek: 3, periodsPerLesson: 2, weekdays: [1, 2, 3, 4, 5], rooms: [] })
    expect(r.ok).toBe(true)
    const days = new Set(r.placed.map((p) => p.slot.weekday))
    expect(days.size).toBe(3) // 三次课落在三个不同星期
  })

  it('共享教师的多班：教师冲突被规避（逼出回溯/换槽）', async () => {
    // 同一教师带 3 个班，每班每周 2 次 → 教师不能同时上两班
    const tr = await svc.teacher.create({ name: '共享师', teacherNo: 'T-shared', subjects: [] } as any)
    const co = await svc.course.create({ name: '共享课', code: 'C-shared', colorIndex: 1, pricePerLesson: 100 } as any)
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const cls = await svc.klass.create({ name: `共享班${i}`, courseId: co.id, teacherId: tr.id, room: null, capacity: 30 } as any)
      ids.push(cls.id)
    }
    const r = await svc.autoSchedule.run({ classIds: ids, lessonsPerWeek: 2, periodsPerLesson: 2, weekdays: [1, 2, 3, 4, 5], rooms: [] })
    expect(r.ok).toBe(true)
    expect(r.placed.length).toBe(6)
    await assertNoConflicts()
  })

  it('尊重既有排课障碍：不与已占用时段冲突', async () => {
    const { cls } = await makeClass('既有班', '既有师', 'A101', 'exist')
    // 手动占用 周一 P1-2 A101
    const manual = await svc.schedule.create({ classId: cls.id, weekday: 1, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 20, room: 'A101', teacherId: (await svc.klass.getById(cls.id))!.teacherId } as any)
    expect(manual.ok).toBe(true)
    // 自动再排 1 次/周（应避开已占用的 周一P1-2@A101）
    const r = await svc.autoSchedule.run({ classIds: [cls.id], lessonsPerWeek: 1, periodsPerLesson: 2, weekdays: [1, 2, 3, 4, 5], rooms: ['A101'] })
    expect(r.ok).toBe(true)
    expect(r.placed.length).toBe(1)
    // 新排的不能是 周一P1-2（已占用）
    const p = r.placed[0]
    const clashesMondayP12 = p.slot.weekday === 1 && p.slot.startPeriod === 1
    expect(clashesMondayP12).toBe(false)
    await assertNoConflicts()
  })

  it('不可行场景：all-or-nothing，不落库，全部记失败', async () => {
    // 1 教师 5 班，每班每周 5 次，仅周一~周五每天 1 个 2 节窗口 → 教师时段不够
    const tr = await svc.teacher.create({ name: '瓶颈师', teacherNo: 'T-bn', subjects: [] } as any)
    const co = await svc.course.create({ name: '瓶颈课', code: 'C-bn', colorIndex: 1, pricePerLesson: 100 } as any)
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const cls = await svc.klass.create({ name: `瓶颈班${i}`, courseId: co.id, teacherId: tr.id, room: null, capacity: 30 } as any)
      ids.push(cls.id)
    }
    const before = (await svc.schedule.weekTimetable({})).length
    const r = await svc.autoSchedule.run({ classIds: ids, lessonsPerWeek: 5, periodsPerLesson: 2, weekdays: [1], rooms: ['R1'], maxBacktracks: 500 })
    expect(r.ok).toBe(false)
    expect(r.placed.length).toBe(0)
    expect(r.failed.length).toBe(25)
    // all-or-nothing：一条都没落库
    const after = (await svc.schedule.weekTimetable({})).length
    expect(after).toBe(before)
  })

  it('教室池约束：班级无固定教室时从池中分配且不撞', async () => {
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const { cls } = await makeClass(`池班${i}`, `池师${i}`, null, `pool${i}`)
      ids.push(cls.id)
    }
    // 3 个班共享 2 间教室，每周各 2 次 → 需要错开教室
    const r = await svc.autoSchedule.run({ classIds: ids, lessonsPerWeek: 2, periodsPerLesson: 2, weekdays: [1, 2, 3, 4, 5], rooms: ['P1', 'P2'] })
    expect(r.ok).toBe(true)
    expect(r.placed.every((p) => p.room === 'P1' || p.room === 'P2')).toBe(true)
    await assertNoConflicts()
  })
})
