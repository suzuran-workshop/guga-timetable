import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, Trash2, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { StudentDialog } from '../components/dialogs/student-dialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Badge } from '../components/ui/badge.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { STUDENT_STATUS_LABEL, type StudentDto, type StudentStatus, type Page } from '../../shared/domain.js'

const STATUS_VARIANT: Record<StudentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  graduated: 'secondary',
  suspended: 'outline',
  dropped: 'destructive',
}

/** 学员管理：搜索/状态筛选 + 分页表格 + 新建/编辑/删除。 */
export function StudentsPage() {
  const navigate = useNavigate()
  const can = useAppStore((s) => s.can)
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StudentStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const path = `/api/students${qs({ page, pageSize: 10, keyword: search || undefined, status: status === 'all' ? undefined : status })}`
  const { data, loading, reload } = useApi<Page<StudentDto>>(path, { deps: [page, search, status] })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StudentDto | null>(null)
  const [deleting, setDeleting] = useState<StudentDto | null>(null)

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (s: StudentDto) => { setEditing(s); setDialogOpen(true) }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/students/${deleting.id}`)
      toast.success(`已删除学员「${deleting.name}」`)
      setDeleting(null)
      reload()
    } catch (e) { toastError(e) }
  }

  const columns: Column<StudentDto>[] = [
    {
      key: 'name', header: '学员',
      cell: (s) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
            {s.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{s.name}</div>
            <div className="text-xs text-muted-foreground">{s.studentNo}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone', header: '联系方式',
      cell: (s) => s.phone ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />{s.phone}
        </span>
      ) : <span className="text-muted-foreground/50">—</span>,
    },
    { key: 'gradeLevel', header: '年级', cell: (s) => <span className="text-sm">{s.gradeLevel || '—'}</span> },
    {
      key: 'balance', header: '剩余课时',
      cell: (s) => (
        <Badge variant={s.balanceLessons <= 3 ? 'destructive' : 'secondary'} className="tabular-nums">
          {s.balanceLessons} 课时
        </Badge>
      ),
    },
    { key: 'classes', header: '班级', cell: (s) => <span className="text-sm tabular-nums">{s.classCount}</span> },
    {
      key: 'status', header: '状态',
      cell: (s) => <Badge variant={STATUS_VARIANT[s.status]}>{STUDENT_STATUS_LABEL[s.status]}</Badge>,
    },
    {
      key: 'actions', header: '', className: 'w-12 text-right',
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><circle cx="7.5" cy="3" r="1.5"/><circle cx="7.5" cy="7.5" r="1.5"/><circle cx="7.5" cy="12" r="1.5"/></svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/students/${s.id}`) }}>
              <Search className="mr-2 h-4 w-4" /> 查看档案
            </DropdownMenuItem>
            {can('student:write') && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(s) }}>
                <Pencil className="mr-2 h-4 w-4" /> 编辑
              </DropdownMenuItem>
            )}
            {can('student:delete') && (
              <DropdownMenuItem className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); setDeleting(s) }}>
                <Trash2 className="mr-2 h-4 w-4" /> 删除
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 10))

  return (
    <div>
      <PageHeader title="学员管理" description={`共 ${total} 名学员`}>
        {can('student:write') && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />新建学员</Button>
        )}
      </PageHeader>

      {/* 工具栏 */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索姓名 / 学号 / 电话"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(keyword); setPage(1) } }}
          />
        </div>
        <Button variant="secondary" onClick={() => { setSearch(keyword); setPage(1) }}>搜索</Button>
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {(Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STUDENT_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(s) => s.id}
        loading={loading}
        onRowClick={(s) => navigate(`/students/${s.id}`)}
      />

      {/* 分页 */}
      {total > 10 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <StudentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={editing}
        onSaved={() => { setDialogOpen(false); reload() }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="删除学员"
        description={`确定删除「${deleting?.name}」吗？该操作会同时移除其班级关系、考勤与成绩记录，不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
