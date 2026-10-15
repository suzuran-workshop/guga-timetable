import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { TeacherDialog } from '../components/dialogs/teacher-dialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Badge } from '../components/ui/badge.js'
import { TEACHER_STATUS_LABEL, type TeacherDto, type Page } from '@guga/shared'

/** 教师管理：搜索 + 表格 + 新建/编辑/删除。 */
export function TeachersPage() {
  const can = useAppStore((s) => s.can)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  const path = `/api/teachers${qs({ page, pageSize: 10, keyword: search || undefined })}`
  const { data, loading, reload } = useApi<Page<TeacherDto>>(path, { deps: [page, search] })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TeacherDto | null>(null)
  const [deleting, setDeleting] = useState<TeacherDto | null>(null)

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/teachers/${deleting.id}`)
      toast.success(`已删除教师「${deleting.name}」`)
      setDeleting(null); reload()
    } catch (e) { toastError(e) }
  }

  const columns: Column<TeacherDto>[] = [
    {
      key: 'name', header: '教师',
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/12 text-xs font-semibold text-violet-600 dark:text-violet-400">
            {t.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{t.name}</div>
            <div className="text-xs text-muted-foreground">{t.teacherNo}</div>
          </div>
        </div>
      ),
    },
    { key: 'title', header: '职称', cell: (t) => <span className="text-sm">{t.title || '—'}</span> },
    {
      key: 'subjects', header: '任教学科',
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.subjects.length ? t.subjects.map((s) => <Badge key={s} variant="outline">{s}</Badge>)
            : <span className="text-muted-foreground/50">—</span>}
        </div>
      ),
    },
    {
      key: 'phone', header: '联系方式',
      cell: (t) => t.phone ? <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" />{t.phone}</span> : <span className="text-muted-foreground/50">—</span>,
    },
    { key: 'classes', header: '带班数', cell: (t) => <span className="text-sm tabular-nums">{t.classCount}</span> },
    {
      key: 'status', header: '状态',
      cell: (t) => <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{TEACHER_STATUS_LABEL[t.status]}</Badge>,
    },
    {
      key: 'actions', header: '', className: 'w-20 text-right',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          {can('teacher:write') && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditing(t); setDialogOpen(true) }}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can('teacher:delete') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleting(t) }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 10))

  return (
    <div>
      <PageHeader title="教师管理" description={`共 ${total} 名教师`}>
        {can('teacher:write') && <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />新建教师</Button>}
      </PageHeader>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索姓名 / 工号 / 职称" value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(keyword); setPage(1) } }} />
        </div>
        <Button variant="secondary" onClick={() => { setSearch(keyword); setPage(1) }}>搜索</Button>
      </div>

      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(t) => t.id} loading={loading} />

      {total > 10 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <TeacherDialog open={dialogOpen} onOpenChange={setDialogOpen} teacher={editing} onSaved={() => { setDialogOpen(false); reload() }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="删除教师"
        description={`确定删除「${deleting?.name}」吗？`} confirmText="删除" destructive onConfirm={handleDelete} />
    </div>
  )
}
