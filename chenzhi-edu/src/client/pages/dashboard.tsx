import {
  Users, GraduationCap, BookOpen, Layers, CalendarDays, Wallet,
  ClipboardCheck, AlertTriangle, ArrowUpRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useApi } from '../hooks/use-api.js'
import { PageHeader } from '../components/page-header.js'
import { StatCard } from '../components/stat-card.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Badge } from '../components/ui/badge.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { formatMoney } from '../lib/utils.js'
import type { DashboardStats } from '../../shared/domain.js'
import { ORDER_STATUS_LABEL } from '../../shared/domain.js'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

/** 工作台：核心指标卡 + 营收趋势 + 学员状态分布 + 课程营收排行 + 最近订单。 */
export function DashboardPage() {
  const { data, loading } = useApi<DashboardStats>('/api/dashboard/stats')
  const navigate = useNavigate()

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="工作台" description="教务运营概览与关键指标" />

      {/* 指标卡 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="在读学员" value={data.activeStudents} icon={Users} accent="primary"
          hint={`共 ${data.students} 名学员`} />
        <StatCard title="在职教师" value={data.teachers} icon={GraduationCap} accent="violet" />
        <StatCard title="开设课程" value={data.courses} icon={BookOpen} accent="sky"
          hint={`${data.classes} 个班级`} />
        <StatCard title="进行中班级" value={data.ongoingClasses} icon={Layers} accent="green"
          hint={`共 ${data.classes} 个班级`} />
        <StatCard title="本月营收" value={formatMoney(data.monthRevenue)} icon={Wallet} accent="green"
          hint={`${data.monthOrders} 笔订单`} />
        <StatCard title="今日课时" value={data.todayLessons} icon={CalendarDays} accent="amber"
          hint="今日排课节数" />
        <StatCard title="出勤率" value={`${data.attendanceRate}%`} icon={ClipboardCheck} accent="sky" />
        <StatCard title="课时预警" value={data.lowBalanceStudents} icon={AlertTriangle}
          accent={data.lowBalanceStudents > 0 ? 'rose' : 'green'}
          hint="余额 ≤ 3 课时" />
      </div>

      {/* 图表行 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">营收趋势（近 6 个月）</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.revenueByMonth.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `¥${(v / 100).toFixed(0)}`} width={56} />
                  <Tooltip formatter={(v: any) => formatMoney(Number(v))} labelStyle={{ color: '#000' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#rev)" name="营收" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无营收数据</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">学员状态分布</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.studentsByStatus.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.studentsByStatus} dataKey="count" nameKey="label"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {data.studentsByStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无学员数据</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 排行 + 最近订单 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">课程营收排行</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topCourses.length ? data.topCourses.map((c, i) => {
              const max = data.topCourses[0].revenue || 1
              return (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
                      {c.name}
                    </span>
                    <span className="font-medium tabular-nums">{formatMoney(c.revenue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(c.revenue / max) * 100}%` }} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{c.students} 名学员</div>
                </div>
              )
            }) : <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">最近订单</CardTitle>
            <Badge variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => navigate('/orders')}>
              查看全部 <ArrowUpRight className="ml-1 h-3 w-3" />
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentOrders.length ? data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{o.studentName} · {o.courseName}</div>
                  <div className="text-xs text-muted-foreground">{o.orderNo} · {o.lessonsPurchased} 课时</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatMoney(o.amount)}</div>
                  <Badge variant={o.status === 'paid' ? 'default' : 'secondary'} className="mt-0.5 text-[10px]">
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                </div>
              </div>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无订单</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
