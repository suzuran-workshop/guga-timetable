import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, genOrderNo, normalizePage, type PageQuery } from './base.js'
import type { OrderDto, OrderInput, OrderStatus, PayMethod } from '../../shared/domain.js'

/**
 * 订单仓储 + 课时充值业务。
 * - 创建订单默认 paid → 给学员 balanceLessons 充值 lessonsPurchased。
 * - 退款 refunded → 扣回已充课时（floor 0）。
 * - 月营收统计（按 createdAt 落在月份内的 paid 订单金额求和）。
 */
export class OrderRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(r: any): OrderDto {
    return {
      id: r.id, orderNo: r.orderNo, studentId: r.studentId, studentName: r.studentName ?? r._studentName ?? '',
      courseId: r.courseId, courseName: r.courseName ?? r._courseName ?? '',
      lessonsPurchased: Number(r.lessonsPurchased), amount: Number(r.amount),
      payMethod: r.payMethod, status: r.status, paidAt: r.paidAt, remark: r.remark,
      createdAt: Number(r.createdAt),
    }
  }

  private selectJoined() {
    const t = this.t
    return this.db.select({
      id: t.orders.id, orderNo: t.orders.orderNo, studentId: t.orders.studentId,
      courseId: t.orders.courseId, lessonsPurchased: t.orders.lessonsPurchased, amount: t.orders.amount,
      payMethod: t.orders.payMethod, status: t.orders.status, paidAt: t.orders.paidAt,
      remark: t.orders.remark, createdAt: t.orders.createdAt,
      _studentName: t.students.name, _courseName: t.courses.name,
    }).from(t.orders)
      .leftJoin(t.students, eq(t.orders.studentId, t.students.id))
      .leftJoin(t.courses, eq(t.orders.courseId, t.courses.id))
  }

  async list(q: PageQuery & { status?: OrderStatus; studentId?: string }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.status) conds.push(eq(t.orders.status, q.status))
    if (q.studentId) conds.push(eq(t.orders.studentId, q.studentId))
    if (q.keyword) {
      const kw = `%${q.keyword}%`
      conds.push(or(like(t.orders.orderNo, kw), like(t.students.name, kw)))
    }
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.selectJoined().where(where) : this.selectJoined())
      .orderBy(desc(t.orders.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.orders).where(where)
      : this.db.select({ c: count() }).from(t.orders))
    return { items: rows.map((r: any) => this.toDto(r)), total: Number(totalRow[0]?.c ?? 0), page, pageSize }
  }

  async getById(id: string): Promise<OrderDto | null> {
    const rows = await this.selectJoined().where(eq(this.t.orders.id, id)).limit(1)
    return rows[0] ? this.toDto(rows[0]) : null
  }

  /** 创建订单：默认已支付 → 充值课时。 */
  async create(input: OrderInput, createdBy?: string): Promise<OrderDto> {
    const t = this.t
    const now = this.now()
    const status = input.status ?? 'paid'
    const orderNo = genOrderNo()
    const rows = await this.db.insert(t.orders).values({
      orderNo, studentId: input.studentId, courseId: input.courseId,
      lessonsPurchased: input.lessonsPurchased, amount: input.amount,
      payMethod: input.payMethod ?? 'wechat', status,
      paidAt: status === 'paid' ? (input.paidAt ?? new Date(now).toISOString().slice(0, 10)) : (input.paidAt ?? null),
      remark: input.remark, createdBy, createdAt: now, updatedAt: now,
    }).returning()
    if (status === 'paid') {
      await this.db.update(t.students)
        .set({ balanceLessons: sql`${t.students.balanceLessons} + ${input.lessonsPurchased}`, updatedAt: now })
        .where(eq(t.students.id, input.studentId))
    }
    const joined = await this.selectJoined().where(eq(t.orders.id, rows[0].id)).limit(1)
    return this.toDto(joined[0])
  }

  /** 更新订单状态（含支付/退款的课时联动）。 */
  async updateStatus(id: string, status: OrderStatus): Promise<OrderDto | null> {
    const t = this.t
    const cur = await this.db.select().from(t.orders).where(eq(t.orders.id, id)).limit(1)
    if (!cur[0]) return null
    const wasPaid = cur[0].status === 'paid'
    const nowPaid = status === 'paid'
    await this.db.update(t.orders).set({
      status,
      paidAt: nowPaid ? (cur[0].paidAt ?? new Date().toISOString().slice(0, 10)) : cur[0].paidAt,
      updatedAt: this.now(),
    }).where(eq(t.orders.id, id))
    // 课时联动：新支付且原先未支付 → 充值；转为退款/取消且原先已支付 → 扣回
    if (nowPaid && !wasPaid) {
      await this.db.update(t.students)
        .set({ balanceLessons: sql`${t.students.balanceLessons} + ${cur[0].lessonsPurchased}`, updatedAt: this.now() })
        .where(eq(t.students.id, cur[0].studentId))
    } else if (!nowPaid && wasPaid) {
      await this.db.update(t.students)
        .set({ balanceLessons: sql`MAX(0, ${t.students.balanceLessons} - ${cur[0].lessonsPurchased})`, updatedAt: this.now() })
        .where(eq(t.students.id, cur[0].studentId))
    }
    return this.getById(id)
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.orders).where(eq(this.t.orders.id, id)).returning()
    return rows.length > 0
  }

  /** 近 N 个月营收（paid 订单，按创建月份聚合）。返回 [{month:'YYYY-MM', revenue}] */
  async revenueByMonth(months = 6): Promise<{ month: string; revenue: number }[]> {
    const t = this.t
    const rows = await this.db.select({
      createdAt: t.orders.createdAt, amount: t.orders.amount,
    }).from(t.orders).where(eq(t.orders.status, 'paid'))
    const buckets: Record<string, number> = {}
    for (const r of rows) {
      const d = new Date(Number(r.createdAt))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets[key] = (buckets[key] ?? 0) + Number(r.amount)
    }
    // 取最近 months 个键，升序
    const keys = Object.keys(buckets).sort().slice(-months)
    return keys.map((k) => ({ month: k, revenue: buckets[k] }))
  }

  /** 指定月份（YYYY-MM）营收合计与订单数 */
  async monthRevenue(ym: string): Promise<{ revenue: number; count: number }> {
    const t = this.t
    const rows = await this.db.select({ amount: t.orders.amount, createdAt: t.orders.createdAt })
      .from(t.orders).where(eq(t.orders.status, 'paid'))
    let revenue = 0, c = 0
    for (const r of rows) {
      const d = new Date(Number(r.createdAt))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key === ym) { revenue += Number(r.amount); c++ }
    }
    return { revenue, count: c }
  }

  /** 课程营收排行（paid 订单按课程聚合金额与学员数） */
  async topCourses(limit = 5): Promise<{ name: string; students: number; revenue: number }[]> {
    const t = this.t
    const rows = await this.db.select({
      courseId: t.orders.courseId, courseName: t.courses.name, amount: t.orders.amount, studentId: t.orders.studentId,
    }).from(t.orders).leftJoin(t.courses, eq(t.orders.courseId, t.courses.id))
      .where(eq(t.orders.status, 'paid'))
    const agg: Record<string, { name: string; revenue: number; students: Set<string> }> = {}
    for (const r of rows) {
      const key = r.courseId
      agg[key] ??= { name: r.courseName ?? '未知课程', revenue: 0, students: new Set() }
      agg[key].revenue += Number(r.amount)
      agg[key].students.add(r.studentId)
    }
    return Object.values(agg)
      .map((a) => ({ name: a.name, revenue: a.revenue, students: a.students.size }))
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, limit)
  }

  async recent(limit = 5): Promise<OrderDto[]> {
    const t = this.t
    const rows = await this.selectJoined().orderBy(desc(t.orders.createdAt)).limit(limit)
    return rows.map((r: any) => this.toDto(r))
  }
}
