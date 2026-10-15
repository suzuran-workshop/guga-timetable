import { useState } from 'react'
import { Shield, Users, Info, RefreshCw, CheckCircle2, KeyRound, Crown, CalendarDays, Plus, Trash2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Separator } from '../components/ui/separator.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import { formatDateTime, formatDate } from '../lib/utils.js'
import { ROLE_LABEL, Role, termSchema, type LicenseStateDto, type TermDto } from '@guga/shared'

/** /api/users 列表行 */
interface UserRow {
  userId: string
  role: string
  roleLabel: string
  realName: string | null
  phone: string | null
  teacherId: string | null
  createdAt: number
  username?: string | null
  nickname?: string | null
}

/**
 * 系统设置：用户与角色管理（admin）+ 授权信息 + 关于系统。
 */
export function SettingsPage() {
  return (
    <div>
      <PageHeader title="系统设置" description="学期、用户角色、授权状态与系统信息" />
      <Tabs defaultValue="terms">
        <TabsList>
          <TabsTrigger value="terms"><CalendarDays className="mr-1.5 h-4 w-4" />学期管理</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-1.5 h-4 w-4" />用户与角色</TabsTrigger>
          <TabsTrigger value="license"><KeyRound className="mr-1.5 h-4 w-4" />授权信息</TabsTrigger>
          <TabsTrigger value="about"><Info className="mr-1.5 h-4 w-4" />关于系统</TabsTrigger>
        </TabsList>
        <TabsContent value="terms" className="mt-4">
          <TermsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="license" className="mt-4">
          <LicenseTab />
        </TabsContent>
        <TabsContent value="about" className="mt-4">
          <AboutTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** 学期管理（仅 admin）：建学期、设为当前、删除。日期↔教学周的锚点。 */
function TermsTab() {
  const user = useAppStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { data, loading, reload } = useApi<{ items: TermDto[] }>('/api/terms', { silent: !isAdmin })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TermDto | null>(null)
  const [deleting, setDeleting] = useState<TermDto | null>(null)

  if (!isAdmin) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <Shield className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">仅管理员可访问学期管理</p>
      </CardContent></Card>
    )
  }

  const setCurrent = async (id: string) => {
    try {
      await api.post(`/api/terms/${id}/current`)
      toast.success('已设为当前学期')
      reload()
    } catch (e) { toastError(e) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/terms/${deleting.id}`)
      toast.success('已删除学期')
      setDeleting(null); reload()
    } catch (e) { toastError(e) }
  }

  const terms = data?.items ?? []
  /** 已有当前学期时，新建不默认夺权——避免「建下学期」静默把全校时间锚点搬到未来周段。 */
  const hasCurrentTerm = terms.some((t) => t.isCurrent)

  const fields: FieldSpec[] = [
    { name: 'name', label: '学期名称', type: 'text', required: true, colSpan: 2, placeholder: '如 2026-2027 学年第一学期' },
    { name: 'startDate', label: '开始日期（第1周周一）', type: 'date', required: true, hint: '非周一会自动规整到所在周周一' },
    { name: 'endDate', label: '结束日期', type: 'date', required: true },
    { name: 'totalWeeks', label: '总周数', type: 'number', min: 1, max: 40 },
    {
      name: 'isCurrent', label: '设为当前学期', type: 'switch',
      hint: '当前学期是「日期 ↔ 教学周」的锚点；勾选后课表周次与调换课立即改按此学期解析（原当前学期会被取消）',
    },
  ]

  const columns: Column<TermDto>[] = [
    {
      key: 'name', header: '学期',
      cell: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{t.name}</span>
          {t.isCurrent && <Badge className="gap-1"><Star className="h-3 w-3" />当前</Badge>}
        </div>
      ),
    },
    { key: 'range', header: '起止', cell: (t) => <span className="text-sm tabular-nums">{t.startDate} ~ {t.endDate}</span> },
    { key: 'weeks', header: '总周数', cell: (t) => <span className="text-sm tabular-nums">{t.totalWeeks} 周</span> },
    {
      key: 'actions', header: '', className: 'w-40 text-right',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          {!t.isCurrent && <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); setCurrent(t.id) }}><Star className="h-3.5 w-3.5" />设为当前</Button>}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleting(t) }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">学期是「日期 ↔ 教学周」的锚点，课表周次与调换课都依赖当前学期。</p>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="mr-1.5 h-4 w-4" />新建学期</Button>
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(t) => t.id} loading={loading} empty="暂无学期，点击「新建学期」" />

      <FormDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        title={editing ? '编辑学期' : '新建学期'} fields={fields} schema={termSchema as any}
        defaultValues={editing ? { ...editing, isCurrent: editing.isCurrent } : { totalWeeks: 20, isCurrent: !hasCurrentTerm, startDate: '', endDate: '' }}
        endpoint="/api/terms" editId={editing?.id ?? null}
        onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({ ...v, totalWeeks: Number(v.totalWeeks) || 20, isCurrent: !!v.isCurrent })}
        width="max-w-lg"
      />
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="删除学期"
        description={`确定删除「${deleting?.name}」吗？已有排课不受影响，但日期↔教学周解析会失去该学期锚点。`}
        confirmText="删除" destructive onConfirm={handleDelete} />
    </div>
  )
}

/** 用户与角色管理（仅 admin）。 */
function UsersTab() {
  const user = useAppStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { data, loading, reload } = useApi<{ items: UserRow[] }>('/api/users', { silent: !isAdmin })
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Shield className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">仅管理员可访问用户与角色管理</p>
        </CardContent>
      </Card>
    )
  }

  const changeRole = async (row: UserRow, role: string) => {
    if (role === row.role) return
    setBusyId(row.userId)
    try {
      await api.patch(`/api/users/${row.userId}`, { role })
      toast.success(`已将「${row.realName || row.userId.slice(0, 8)}」设为${ROLE_LABEL[role as Role]}`)
      reload()
    } catch (e) {
      toastError(e) // 后端保护最后一个 admin（409）
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<UserRow>[] = [
    {
      key: 'user', header: '用户',
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
            {(u.realName || u.userId).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate font-medium">
              {u.realName || u.nickname || u.userId.slice(0, 8)}
              {u.role === 'admin' && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">{u.userId.slice(0, 12)}…</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role', header: '角色',
      cell: (u) => (
        <Select value={u.role} onValueChange={(v) => changeRole(u, v)} disabled={busyId === u.userId}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Role.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    { key: 'realName', header: '实名', cell: (u) => <span className="text-sm">{u.realName || '—'}</span> },
    { key: 'phone', header: '电话', cell: (u) => <span className="text-sm text-muted-foreground">{u.phone || '—'}</span> },
    { key: 'createdAt', header: '创建时间', cell: (u) => <span className="text-sm tabular-nums text-muted-foreground">{formatDateTime(u.createdAt)}</span> },
  ]

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        共 {data?.items.length ?? 0} 名用户。调整角色即时生效；系统保护最后一名管理员不被降级。
      </p>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(u) => u.userId}
        loading={loading}
        empty="暂无用户"
      />
    </div>
  )
}

/** 授权信息（所有用户可见）。 */
function LicenseTab() {
  const license = useAppStore((s) => s.license)
  const refreshLicense = useAppStore((s) => s.refreshLicense)
  const [busy, setBusy] = useState(false)

  const statusVariant = (s?: string): 'default' | 'secondary' | 'destructive' | 'outline' =>
    s === 'active' ? 'default' : s === 'suspended' || s === 'expired' ? 'destructive' : 'secondary'
  const statusLabel: Record<string, string> = {
    active: '正常', grace: '宽限期', suspended: '已停服', expired: '已到期', unknown: '未知', disabled: '未启用',
  }

  const handleRefresh = async () => {
    setBusy(true)
    await refreshLicense()
    setBusy(false)
    toast.success('已刷新授权状态')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={busy}>
          <RefreshCw className={busy ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />刷新授权状态
        </Button>
      </div>

      {!license ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            授权模块未启用（本地开发）
          </CardContent>
        </Card>
      ) : (
        <LicenseCard license={license} statusVariant={statusVariant} statusLabel={statusLabel} />
      )}
    </div>
  )
}

function LicenseCard({
  license, statusVariant, statusLabel,
}: {
  license: LicenseStateDto
  statusVariant: (s?: string) => 'default' | 'secondary' | 'destructive' | 'outline'
  statusLabel: Record<string, string>
}) {
  const verified = license.signature === 'verified'
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />授权许可
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="授权状态">
            <Badge variant={statusVariant(license.status)}>{statusLabel[license.status] ?? license.status}</Badge>
          </InfoItem>
          <InfoItem label="处置强度">
            <Badge variant="outline">{license.enforcement}</Badge>
          </InfoItem>
          <InfoItem label="签名校验">
            {verified ? (
              <span className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />已验签
              </span>
            ) : (
              <Badge variant="secondary">{license.signature}</Badge>
            )}
          </InfoItem>
          <InfoItem label="到期时间">
            <span className="text-sm tabular-nums">{formatDate(license.expiresAt) || '永不过期'}</span>
          </InfoItem>
        </div>

        {license.notice && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {license.notice}
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">已授权功能（{license.features.length}）</p>
          {license.features.length ? (
            <div className="flex flex-wrap gap-1.5">
              {license.features.map((f) => (
                <Badge key={f} variant="outline" className="font-mono text-xs">{f}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">无</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** 关于系统。 */
function AboutTab() {
  const user = useAppStore((s) => s.user)
  const rows: [string, React.ReactNode][] = [
    ['系统名称', <span className="font-medium">辰知教务 · Academic Suite</span>],
    ['版本', <span className="font-mono tabular-nums">0.1.0</span>],
    ['当前用户', <span>{user?.nickname || user?.username || '—'}（{user ? ROLE_LABEL[user.role] : '—'}）</span>],
    ['权限点数量', <span className="tabular-nums">{user?.permissions.length ?? 0} 项</span>],
    [
      '技术栈',
      <div className="flex flex-wrap gap-1.5">
        {['Vite 8', 'React 19', 'shadcn/ui (Tailwind v3)', '@homurajs 全家桶', 'Hono', 'Drizzle ORM', 'SQLite'].map((t) => (
          <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
        ))}
      </div>,
    ],
    [
      '能力模块',
      <div className="flex flex-wrap gap-1.5">
        {['core 配置/日志', 'app-kit 装配', 'auth 认证', 'license 授权', 'db 持久层', 'storage 对象存储'].map((t) => (
          <Badge key={t} variant="outline" className="font-mono text-xs">{t}</Badge>
        ))}
      </div>,
    ],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4 text-primary" />关于辰知教务
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-0">
          {rows.map(([label, value], i) => (
            <div key={label}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
