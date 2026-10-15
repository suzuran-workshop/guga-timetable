import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Badge } from '../components/ui/badge.js'
import { courseSchema, COURSE_STATUS_LABEL, type CourseDto, type Page } from '@guga/shared'
import { formatMoney } from '../lib/utils.js'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#eab308', '#6366f1']

const FIELDS: FieldSpec[] = [
  { name: 'name', label: '课程名称', type: 'text', required: true, placeholder: '如 高一数学·同步' },
  { name: 'code', label: '课程代码', type: 'text', required: true, placeholder: '如 MATH-101' },
  { name: 'subject', label: '学科', type: 'text', placeholder: '如 数学' },
  { name: 'colorIndex', label: '课表颜色', type: 'select', options: COLORS.map((_, i) => ({ value: String(i + 1), label: `配色 ${i + 1}` })) },
  { name: 'creditHours', label: '学分', type: 'number', min: 0 },
  { name: 'totalLessons', label: '总课时', type: 'number', min: 0 },
  { name: 'pricePerLesson', label: '单课时价格(分)', type: 'number', min: 0, hint: '以分为单位，如 20000 = ¥200' },
  { name: 'status', label: '状态', type: 'select', options: Object.entries(COURSE_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })) },
  { name: 'description', label: '课程简介', type: 'textarea', colSpan: 2 },
]

/** 课程管理。 */
export function CoursesPage() {
  const can = useAppStore((s) => s.can)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const { data, loading, reload } = useApi<Page<CourseDto>>(`/api/courses${qs({ pageSize: 100, keyword: search || undefined })}`, { deps: [search] })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CourseDto | null>(null)
  const [deleting, setDeleting] = useState<CourseDto | null>(null)

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/courses/${deleting.id}`)
      toast.success(`已删除课程「${deleting.name}」`); setDeleting(null); reload()
    } catch (e) { toastError(e) }
  }

  const columns: Column<CourseDto>[] = [
    {
      key: 'name', header: '课程',
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: COLORS[(c.colorIndex - 1) % 8] }} />
          <div className="min-w-0">
            <div className="truncate font-medium">{c.name}</div>
            <div className="text-xs text-muted-foreground">{c.code}{c.subject ? ` · ${c.subject}` : ''}</div>
          </div>
        </div>
      ),
    },
    { key: 'lessons', header: '课时', cell: (c) => <span className="text-sm tabular-nums">{c.totalLessons} 课时 · {c.creditHours} 学分</span> },
    { key: 'price', header: '单价', cell: (c) => <span className="text-sm tabular-nums">{formatMoney(c.pricePerLesson)}</span> },
    { key: 'classes', header: '班级数', cell: (c) => <Badge variant="secondary" className="tabular-nums">{c.classCount}</Badge> },
    { key: 'status', header: '状态', cell: (c) => <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{COURSE_STATUS_LABEL[c.status]}</Badge> },
    {
      key: 'actions', header: '', className: 'w-20 text-right',
      cell: (c) => (
        <div className="flex justify-end gap-1">
          {can('course:write') && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditing(c); setDialogOpen(true) }}><Pencil className="h-4 w-4" /></Button>}
          {can('course:delete') && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleting(c) }}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="课程管理" description={`共 ${data?.total ?? 0} 门课程`}>
        {can('course:write') && <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />新建课程</Button>}
      </PageHeader>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索课程 / 代码 / 学科" value={keyword}
            onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setSearch(keyword) }} />
        </div>
        <Button variant="secondary" onClick={() => setSearch(keyword)}>搜索</Button>
      </div>

      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(c) => c.id} loading={loading}
        empty={<span className="flex flex-col items-center gap-2"><BookOpen className="h-8 w-8 text-muted-foreground/30" />暂无课程</span>} />

      <FormDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        title={editing ? '编辑课程' : '新建课程'} fields={FIELDS} schema={courseSchema as any}
        defaultValues={editing ? { ...editing, colorIndex: String(editing.colorIndex), pricePerLesson: editing.pricePerLesson } : { colorIndex: '1', creditHours: 0, totalLessons: 0, pricePerLesson: 0, status: 'active' }}
        endpoint="/api/courses" editId={editing?.id ?? null} onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({ ...v, colorIndex: Number(v.colorIndex) })}
      />
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="删除课程"
        description={`确定删除「${deleting?.name}」吗？关联班级不会被删除，但会失去课程信息。`} confirmText="删除" destructive onConfirm={handleDelete} />
    </div>
  )
}
