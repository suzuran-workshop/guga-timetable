import { useState } from 'react'
import { Shield, Users, Info, RefreshCw, CheckCircle2, KeyRound, Crown } from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Separator } from '../components/ui/separator.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import { formatDateTime, formatDate } from '../lib/utils.js'
import { ROLE_LABEL, Role, type LicenseStateDto } from '../../shared/domain.js'

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
      <PageHeader title="系统设置" description="用户角色、授权状态与系统信息" />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="mr-1.5 h-4 w-4" />用户与角色</TabsTrigger>
          <TabsTrigger value="license"><KeyRound className="mr-1.5 h-4 w-4" />授权信息</TabsTrigger>
          <TabsTrigger value="about"><Info className="mr-1.5 h-4 w-4" />关于系统</TabsTrigger>
        </TabsList>
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
