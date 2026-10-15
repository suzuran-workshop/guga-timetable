import { describe, it, expect } from 'vitest'
import {
  weekOfDate, weekdayOfDate, dateOfWeekday, weekStartDate, parseDate, toISODate,
  jsDayToWeekday, startOfWeekMonday,
} from '../domain.js'

// 学期起点必须是「第1周周一」。2026-08-31 是周一（2026-09-01 是周二，故不用它）。
const TERM = '2026-08-31'

describe('日期 ↔ 教学周', () => {
  it('学期起点是周一', () => {
    expect(weekdayOfDate(TERM)).toBe(1)
  })
  it('学期首日 = 第1周', () => {
    expect(weekOfDate(TERM, TERM, 20)).toBe(1)
  })
  it('一周后 = 第2周周一', () => {
    expect(weekOfDate('2026-09-07', TERM, 20)).toBe(2)
    expect(weekdayOfDate('2026-09-07')).toBe(1)
  })
  it('学期前的日期 → null', () => {
    expect(weekOfDate('2026-08-30', TERM, 20)).toBeNull()
  })
  it('超出总周数 → null', () => {
    expect(weekOfDate(TERM, TERM, 1)).toBe(1)
    // 第21周（超过 totalWeeks=20）：TERM + 140 天 = 2027-01-18
    expect(weekOfDate('2027-01-18', TERM, 20)).toBeNull()
  })
  it('第1周周日 = weekday 7', () => {
    expect(weekdayOfDate('2026-09-06')).toBe(7)
    expect(weekOfDate('2026-09-06', TERM, 20)).toBe(1)
  })
})

describe('教学周 + weekday → 日期', () => {
  it('第1周周一 = 学期起点', () => {
    expect(dateOfWeekday(TERM, 1, 1)).toBe(TERM)
  })
  it('第1周周日', () => {
    expect(dateOfWeekday(TERM, 1, 7)).toBe('2026-09-06')
  })
  it('第2周周三', () => {
    expect(dateOfWeekday(TERM, 2, 3)).toBe('2026-09-09')
  })
  it('weekStartDate 第3周', () => {
    expect(weekStartDate(TERM, 3)).toBe('2026-09-14')
  })
  it('往返一致：date→(week,weekday)→date（学期内任取一天）', () => {
    for (const d of ['2026-09-01', '2026-10-20', '2026-12-06', TERM]) {
      const w = weekOfDate(d, TERM, 20)!
      const wd = weekdayOfDate(d)
      expect(dateOfWeekday(TERM, w, wd), `往返 ${d}`).toBe(d)
    }
  })
})

describe('startOfWeekMonday 规整', () => {
  it('周一保持不动', () => {
    expect(startOfWeekMonday('2026-08-31')).toBe('2026-08-31')
  })
  it('周二回退到周一', () => {
    expect(startOfWeekMonday('2026-09-01')).toBe('2026-08-31')
  })
  it('周日回退到同周周一', () => {
    // 2026-09-06 是周日 → 该周周一 08-31... 实为 08-31 的下一周? 09-06 属于 08-31 起的第1周
    expect(startOfWeekMonday('2026-09-06')).toBe('2026-08-31')
  })
  it('规整后 dateOfWeekday 往返成立（即使原始输入非周一）', () => {
    const normalized = startOfWeekMonday('2026-09-03') // 周四 → 该周周一
    expect(weekdayOfDate(normalized)).toBe(1)
    const d = '2026-10-15'
    const w = weekOfDate(d, normalized, 20)!
    expect(dateOfWeekday(normalized, w, weekdayOfDate(d))).toBe(d)
  })
})

describe('边界', () => {
  it('jsDayToWeekday: 0→7, 1→1, 6→6', () => {
    expect(jsDayToWeekday(0)).toBe(7)
    expect(jsDayToWeekday(1)).toBe(1)
    expect(jsDayToWeekday(6)).toBe(6)
  })
  it('parseDate/toISODate 往返', () => {
    expect(toISODate(parseDate('2026-02-28'))).toBe('2026-02-28')
  })
})
