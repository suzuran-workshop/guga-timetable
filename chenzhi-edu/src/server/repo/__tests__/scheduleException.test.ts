import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase, migrate } from '../../db/index.js'
import { initTables } from '../../db/tables.js'
import { Services } from '../../repo/index.js'
import type { DbBundle } from '../../db/index.js'

/**
 * 调换课（排课例外）解析测试。
 * 学期起点 2026-08-31（周一）为第 1 周。验证 resolveDay 的例外叠加语义：
 * 停课 / 代课 / 对调（跨日、同日）/ occurrence 存在性校验 / 恢复。
 */

let b: DbBundle
let svc: Services

// 第1周：周一 09-01... 实际 2026-08-31 是周一
const MON = '2026-08-31' // 第1周周一
const WED = '2026-09-02' // 第1周周三

async function setup() {
  b = createDatabase({ dbPath: ':memory:', databaseUrl: '' })
  await migrate(b)
  initTables(b)
  svc = new Services(b)
  await svc.term.create({ name: 'T1', startDate: '2026-08-31', endDate: '2027-01-17', totalWeeks: 20, isCurrent: true } as any)
}

/** 建两门课两班两师：A 周一 P1-2 R1；B 周三 P5-6 R2 */
async function twoClasses() {
  const tA = await svc.teacher.create({ name: '甲师', teacherNo: 'TA', subjects: [] } as any)
  const tB = await svc.teacher.create({ name: '乙师', teacherNo: 'TB', subjects: [] } as any)
  const co = await svc.course.create({ name: '课', code: 'CX', colorIndex: 1, pricePerLesson: 100 } as any)
  const cA = await svc.klass.create({ name: 'A班', courseId: co.id, teacherId: tA.id, room: 'R1', capacity: 30 } as any)
  const cB = await svc.klass.create({ name: 'B班', courseId: co.id, teacherId: tB.id, room: 'R2', capacity: 30 } as any)
  const sA = (await svc.schedule.create({ classId: cA.id, weekday: 1, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 20, room: 'R1', teacherId: tA.id } as any)).schedule!
  const sB = (await svc.schedule.create({ classId: cB.id, weekday: 3, startPeriod: 5, endPeriod: 6, weekStart: 1, weekEnd: 20, room: 'R2', teacherId: tB.id } as any)).schedule!
  return { tA, tB, cA, cB, sA, sB }
}

describe('调换课 resolveDay', () => {
  beforeEach(async () => { await setup() })

  it('正常日：命中循环排课，status=normal', async () => {
    await twoClasses()
    const mon = await svc.scheduleException.resolveDay(MON)
    expect(mon.length).toBe(1)
    expect(mon[0].className).toBe('A班')
    expect(mon[0].status).toBe('normal')
    expect(mon[0].week).toBe(1)
    expect(mon[0].weekday).toBe(1)
  })

  it('停课：status=cancelled，课次仍显示', async () => {
    const { sA } = await twoClasses()
    await svc.scheduleException.cancel(sA.id, MON, '运动会')
    const mon = await svc.scheduleException.resolveDay(MON)
    expect(mon.length).toBe(1)
    expect(mon[0].status).toBe('cancelled')
    expect(mon[0].reason).toBe('运动会')
  })

  it('代课：教师被覆盖，status=substituted', async () => {
    const { sA, tB } = await twoClasses()
    await svc.scheduleException.substitute(sA.id, MON, tB.id, '甲师请假')
    const mon = await svc.scheduleException.resolveDay(MON)
    expect(mon[0].status).toBe('substituted')
    expect(mon[0].teacherName).toBe('乙师')
    expect(mon[0].teacherId).toBe(tB.id)
  })

  it('跨日对调：周一 A 调出 + 周三 B 调入；周三反之', async () => {
    const { sA, sB } = await twoClasses()
    const r = await svc.scheduleException.swap({ scheduleIdA: sA.id, dateA: MON, scheduleIdB: sB.id, dateB: WED, reason: '调课' } as any)
    expect(r.ok).toBe(true)
    const mon = await svc.scheduleException.resolveDay(MON)
    // 周一：A 调出（原 P1-2），B 调入（占用 A 的 P1-2 时段）
    expect(mon.find((l) => l.className === 'A班')!.status).toBe('moved_out')
    const bIn = mon.find((l) => l.className === 'B班' && l.status === 'moved_in')!
    expect(bIn.startPeriod).toBe(1) // 占了 A 的 P1-2
    expect(bIn.room).toBe('R2')    // 保留自己教室
    const wed = await svc.scheduleException.resolveDay(WED)
    expect(wed.find((l) => l.className === 'B班')!.status).toBe('moved_out')
    const aIn = wed.find((l) => l.className === 'A班' && l.status === 'moved_in')!
    expect(aIn.startPeriod).toBe(5) // 占了 B 的 P5-6
    expect(aIn.room).toBe('R1')
  })

  it('同日对调：两节交换节次，各留教室', async () => {
    const tA = await svc.teacher.create({ name: '甲师', teacherNo: 'TA', subjects: [] } as any)
    const co = await svc.course.create({ name: '课', code: 'CX', colorIndex: 1, pricePerLesson: 100 } as any)
    const cA = await svc.klass.create({ name: 'A班', courseId: co.id, teacherId: tA.id, room: 'R1', capacity: 30 } as any)
    const cB = await svc.klass.create({ name: 'B班', courseId: co.id, teacherId: tA.id, room: 'R2', capacity: 30 } as any)
    const sA = (await svc.schedule.create({ classId: cA.id, weekday: 1, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 20, room: 'R1', teacherId: tA.id } as any)).schedule!
    const sB = (await svc.schedule.create({ classId: cB.id, weekday: 1, startPeriod: 5, endPeriod: 6, weekStart: 1, weekEnd: 20, room: 'R2', teacherId: tA.id } as any)).schedule!
    const r = await svc.scheduleException.swap({ scheduleIdA: sA.id, dateA: MON, scheduleIdB: sB.id, dateB: MON } as any)
    expect(r.ok).toBe(true)
    const mon = await svc.scheduleException.resolveDay(MON)
    // A 原 P1-2 → moved_out；B 调入 P1-2（占 A 时段）
    const aOut = mon.find((l) => l.className === 'A班' && l.status === 'moved_out')!
    const bIn = mon.find((l) => l.className === 'B班' && l.status === 'moved_in')!
    expect(bIn.startPeriod).toBe(1)
    expect(aOut).toBeTruthy()
    // 不应有重复的正常 A 班课
    expect(mon.filter((l) => l.className === 'A班' && l.status === 'normal').length).toBe(0)
  })

  it('对调校验：occurrence 不存在 → 拒绝', async () => {
    const { sA, sB } = await twoClasses()
    // A 在周三无课（A 是周一的排课）
    const r = await svc.scheduleException.swap({ scheduleIdA: sA.id, dateA: WED, scheduleIdB: sB.id, dateB: WED } as any)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('没有')
  })

  it('对调校验：不能与自身对调', async () => {
    const { sA } = await twoClasses()
    const r = await svc.scheduleException.swap({ scheduleIdA: sA.id, dateA: MON, scheduleIdB: sA.id, dateB: MON } as any)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('自身')
  })

  it('恢复：clearOccurrence 后回到 normal', async () => {
    const { sA } = await twoClasses()
    await svc.scheduleException.cancel(sA.id, MON)
    expect((await svc.scheduleException.resolveDay(MON))[0].status).toBe('cancelled')
    const cleared = await svc.scheduleException.clearOccurrence(sA.id, MON)
    expect(cleared).toBe(1)
    expect((await svc.scheduleException.resolveDay(MON))[0].status).toBe('normal')
  })

  it('非教学周/无排课日：返回空', async () => {
    await twoClasses()
    // 周二无课
    const tue = await svc.scheduleException.resolveDay('2026-09-01')
    expect(tue.length).toBe(0)
  })
})
