import { count, eq } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { tables } from '../db/tables.js'
import type { Services } from '../repo/index.js'
import { STUDENT_STATUS_LABEL } from '@guga/shared'
import type { DashboardStats } from '@guga/shared'

/** 仪表盘聚合服务：一次性算出首页卡片 + 图表所需的全部统计。 */
export class DashboardService {
  constructor(private svc: Services, private bundle: DbBundle) {}

  private get db(): any { return this.bundle.db }
  private get t() { return tables() }

  private async countAll(table: any, where?: any): Promise<number> {
    const rows = where
      ? await this.db.select({ c: count() }).from(table).where(where)
      : await this.db.select({ c: count() }).from(table)
    return Number(rows[0]?.c ?? 0)
  }

  /** 今天的 weekday（1=周一…7=周日） */
  private todayWeekday(d = new Date()): number {
    const js = d.getDay()
    return js === 0 ? 7 : js
  }

  async stats(): Promise<DashboardStats> {
    const t = this.t
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [
      students, activeStudents, teachers, courses, classes, ongoingClasses,
      todayLessons, monthRevenueData, attendanceRate,
    ] = await Promise.all([
      this.countAll(t.students),
      this.countAll(t.students, eq(t.students.status, 'active')),
      this.countAll(t.teachers),
      this.countAll(t.courses),
      this.countAll(t.classes),
      this.countAll(t.classes, eq(t.classes.status, 'ongoing')),
      this.countAll(t.schedules, eq(t.schedules.weekday, this.todayWeekday(now))),
      this.svc.order.monthRevenue(ym),
      this.svc.attendance.attendanceRate(),
    ])

    const lowBalance = await this.svc.student.lowBalance(3)
    const revenueByMonth = await this.svc.order.revenueByMonth(6)
    const statusRows = await this.svc.student.countByStatus()
    const topCourses = await this.svc.order.topCourses(5)
    const recentOrders = await this.svc.order.recent(6)

    return {
      students, activeStudents, teachers, courses, classes, ongoingClasses,
      todayLessons,
      monthRevenue: monthRevenueData.revenue,
      monthOrders: monthRevenueData.count,
      attendanceRate,
      lowBalanceStudents: lowBalance.length,
      revenueByMonth,
      studentsByStatus: statusRows.map((r) => ({
        status: r.status,
        label: STUDENT_STATUS_LABEL[r.status as keyof typeof STUDENT_STATUS_LABEL] ?? r.status,
        count: r.count,
      })),
      topCourses,
      recentOrders,
    }
  }
}
