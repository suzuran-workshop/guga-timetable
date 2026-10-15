import { desc, eq, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository } from './base.js'
import {
  startOfWeekMonday, weekOfDate, weekdayOfDate, toISODate, parseDate,
  type TermDto, type TermInput,
} from '@guga/shared'

/**
 * 学期仓储：日期 ↔ 教学周 的解析地基。
 *
 * 不变量：
 * - startDate 一律规整到「所在周周一」（startOfWeekMonday），保证 weekOfDate/dateOfWeekday 往返一致。
 * - 全表至多一条 isCurrent=true：设为当前学期时，其余自动置 false（单一当前学期）。
 */
export class TermRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(r: any): TermDto {
    return {
      id: r.id, name: r.name, startDate: r.startDate, endDate: r.endDate,
      totalWeeks: Number(r.totalWeeks), isCurrent: !!r.isCurrent, createdAt: Number(r.createdAt),
    }
  }

  async list(): Promise<TermDto[]> {
    const rows = await this.db.select().from(this.t.terms).orderBy(desc(this.t.terms.startDate))
    return rows.map((r: any) => this.toDto(r))
  }

  async getById(id: string): Promise<TermDto | null> {
    const rows = await this.db.select().from(this.t.terms).where(eq(this.t.terms.id, id)).limit(1)
    return rows[0] ? this.toDto(rows[0]) : null
  }

  /** 当前学期（isCurrent=true）；无则回退到最近一个学期；再无则 null */
  async getCurrent(): Promise<TermDto | null> {
    const t = this.t
    const cur = await this.db.select().from(t.terms).where(sql`${t.terms.isCurrent} = 1`).limit(1)
    if (cur[0]) return this.toDto(cur[0])
    const latest = await this.db.select().from(t.terms).orderBy(desc(t.terms.startDate)).limit(1)
    return latest[0] ? this.toDto(latest[0]) : null
  }

  async create(input: TermInput): Promise<TermDto> {
    const t = this.t
    const now = this.now()
    const startDate = startOfWeekMonday(input.startDate)
    // 若标记为当前学期，先清掉其他当前
    if (input.isCurrent) await this.db.update(t.terms).set({ isCurrent: false })
    const rows = await this.db.insert(t.terms).values({
      name: input.name, startDate, endDate: input.endDate,
      totalWeeks: input.totalWeeks ?? 20, isCurrent: input.isCurrent ?? false,
      createdAt: now, updatedAt: now,
    }).returning()
    return this.toDto(rows[0])
  }

  async update(id: string, patch: Partial<TermInput>): Promise<TermDto | null> {
    const t = this.t
    const data: any = { ...patch, updatedAt: this.now() }
    if (patch.startDate) data.startDate = startOfWeekMonday(patch.startDate)
    // 设为当前学期 → 其余置 false
    if (patch.isCurrent === true) await this.db.update(t.terms).set({ isCurrent: false }).where(sql`${t.terms.id} != ${id}`)
    await this.db.update(t.terms).set(data).where(eq(t.terms.id, id))
    return this.getById(id)
  }

  /** 设为当前学期（单一当前学期不变量） */
  async setCurrent(id: string): Promise<TermDto | null> {
    const t = this.t
    await this.db.update(t.terms).set({ isCurrent: false, updatedAt: this.now() })
    await this.db.update(t.terms).set({ isCurrent: true, updatedAt: this.now() }).where(eq(t.terms.id, id))
    return this.getById(id)
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.terms).where(eq(this.t.terms.id, id)).returning()
    return rows.length > 0
  }

  /**
   * 解析某日期在当前学期中的 (week, weekday)。
   * 无当前学期 / 日期不在学期范围 → week 为 null（调用方据此提示「非教学周」）。
   */
  async resolveDate(iso: string): Promise<{ week: number | null; weekday: number; term: TermDto | null }> {
    const term = await this.getCurrent()
    if (!term) return { week: null, weekday: weekdayOfDate(iso), term: null }
    const week = weekOfDate(iso, term.startDate, term.totalWeeks)
    return { week, weekday: weekdayOfDate(iso), term }
  }

  /** 今天在当前学期中的教学周（供课表页缺省周次；无学期则回退 1） */
  async currentWeek(todayIso = toISODate(Date.now())): Promise<number> {
    const { week } = await this.resolveDate(todayIso)
    return week ?? 1
  }
}
