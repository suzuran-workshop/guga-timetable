import { useState } from 'react'
import { Plus, Search, Trash2, Receipt, Wallet, CheckCircle2, Undo2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useCourseOptions } from '../hooks/use-options.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { StatCard } from '../components/stat-card.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Badge } from '../components/ui/badge.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import {
  orderSchema, ORDER_STATUS_LABEL, PAY_METHOD_LABEL,
  type OrderDto, type OrderStatus, type Page,
} from '../../shared/domain.js'
import { formatMoney } from '../lib/utils.js'

const STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary', paid: 'default', refunded: 'outline', cancelled: 'destructive',
}

interface RevenueStats {
  revenueByMonth: { month: string; revenue: number }[]
  topCourses: { name: string; students: number; revenue: number }[]
}

const FIELDS: FieldSpec[] = [
  { name: 'studentId', label: '学员ID', type: 'text', required: true, placeholder: '学员ID' },
  { name: 'courseId', label: '课程', type: 'select', required: true, placeholder: '请选择课程' },
  { name: 'lessonsPurchased', label: '购买课时', type: 'number', required: true, min: 1 },
  { name: 'amount', label: '金额(分)', type: 'number', required: true, min: 0, hint: '单位：分，如 60000 = ¥600' },
  {
    name: 'payMethod', label: '支付方式', type: 'select',
    options: Object.entries(PAY_METHOD_LABEL).map(([v, l]) => ({ value: v, label: l })),
  },
  {
    name: 'status', label: '状态', type: 'select',
    options: Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })),
  },
  { name: 'remark', label: '备注', type: 'textarea', colSpan: 2 },
]

/** 收费订单：营收概览 + 订单列表 + 状态流转（收款/退款）+ 新建订单。 */
export function OrdersPage() {
  const can = useAppStore((s) => s.can)
  const isAdmin = useAppStore((s) => s.user?.role) === 'admin'
  const { options: courseOptions } = useCourseOptions()

  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')

  const { data, loading, reload } = useApi<Page<OrderDto>>(
    `/api/orders${qs({ pageSize: 100, keyword: search || undefined, status: status === 'all' ? undefined : status })}`,
    { deps: [search, status] },
  )
  const { data: stats } = useApi<RevenueStats>('/api/orders/stats/revenue?months=6')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<OrderDto | null>(null)

  const totalRevenue = (stats?.revenueByMonth ?? []).reduce((sum, m) => sum + m.revenue, 0)
  const topCourse = (stats?.topCourses ?? [])[0]

  const transition = async (order: OrderDto, next: OrderStatus, okMsg: string) => {
    try {
      await api.post(`/api/orders/${order.id}/status`, { status: next })
      toast.success(okMsg)
      reload()
    } catch (e) { toastError(e) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/orders/${deleting.id}`)
      toast.success(`已删除订单「${deleting.orderNo}」`)
      setDeleting(null)
      reload()
    } catch (e) { toastError(e) }
  }

  const columns: Column<OrderDto>[] = [
    { key: 'orderNo', header: '订单号', cell: (o) => <span className="font-mono text-xs text-muted-foreground">{o.orderNo}</span> },
    { key: 'student', header: '学员', cell: (o) => <span className="text-sm font-medium">{o.studentName || '—'}</span> },
    { key: 'course', header: '课程', cell: (o) => <span className="text-sm">{o.courseName || '—'}</span> },
    { key: 'lessons', header: '课时', cell: (o) => <span className="text-sm tabular-nums">{o.lessonsPurchased} 课时</span> },
    { key: 'amount', header: '金额', cell: (o) => <span className="text-sm font-medium tabular-nums">{formatMoney(o.amount)}</span> },
    { key: 'payMethod', header: '支付方式', cell: (o) => <Badge variant="outline">{PAY_METHOD_LABEL[o.payMethod]}</Badge> },
    { key: 'status', header: '状态', cell: (o) => <Badge variant={STATUS_VARIANT[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge> },
    {
      key: 'actions', header: '', className: 'w-32 text-right',
      cell: (o) => (
        <div className="flex justify-end gap-1">
          {o.status === 'pending' && can('order:write') && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              onClick={(e) => { e.stopPropagation(); transition(o, 'paid', `订单「${o.orderNo}」已收款`) }}>
              <CheckCircle2 className="h-4 w-4" />收款
            </Button>
          )}
          {o.status === 'paid' && can('order:write') && (
            <Button variant="ghost" size="sm" className="h-8 gap-1"
              onClick={(e) => { e.stopPropagation(); transition(o, 'refunded', `订单「${o.orderNo}」已退款`) }}>
              <Undo2 className="h-4 w-4" />退款
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setDeleting(o) }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="收费订单" description={`共 ${data?.total ?? 0} 笔订单`}>
        {can('order:write') && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />新建订单
          </Button>
        )}
      </PageHeader>

      {/* 营收概览 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="近6月总营收" value={formatMoney(totalRevenue)} icon={Wallet} accent="green" />
        <StatCard title="有营收课程数" value={stats?.topCourses.length ?? 0} icon={TrendingUp} accent="primary" />
        <StatCard title="本月订单数" value={data?.total ?? 0} icon={Receipt} accent="violet" hint="当前筛选结果" />
        <StatCard title="营收冠军课程" value={topCourse ? topCourse.name : '—'} icon={TrendingUp} accent="amber"
          hint={topCourse ? `${topCourse.students} 名学员 · ${formatMoney(topCourse.revenue)}` : undefined} />
      </div>

      {/* 营收趋势图 */}
      {stats?.revenueByMonth.length ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">营收趋势（近 6 个月）</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.revenueByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `¥${(v / 100).toFixed(0)}`} width={56} />
                <Tooltip formatter={(v: any) => formatMoney(Number(v))} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar dataKey="revenue" name="营收" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* 筛选工具栏 */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索订单号 / 学员" value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSearch(keyword) }} />
        </div>
        <Button variant="secondary" onClick={() => setSearch(keyword)}>搜索</Button>
        <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | 'all')}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(o) => o.id}
        loading={loading}
        empty={<span className="flex flex-col items-center gap-2"><Receipt className="h-8 w-8 text-muted-foreground/30" />暂无订单</span>}
      />

      <FormDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        title="新建订单" fields={FIELDS.map((f) => f.name === 'courseId' ? { ...f, options: courseOptions } : f)}
        schema={orderSchema as any}
        defaultValues={{ lessonsPurchased: 10, amount: 0, payMethod: 'wechat', status: 'paid', studentId: '', courseId: courseOptions[0]?.value ?? '' }}
        endpoint="/api/orders" editId={null}
        onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({ ...v, lessonsPurchased: Number(v.lessonsPurchased), amount: Number(v.amount) })}
      />

      <ConfirmDialog
        open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="删除订单"
        description={`确定删除订单「${deleting?.orderNo}」吗？此操作不可恢复，且不会回滚已充值的课时余额。`}
        confirmText="删除" destructive onConfirm={handleDelete}
      />
    </div>
  )
}
