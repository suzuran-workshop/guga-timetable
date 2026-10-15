import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Pencil, Trash2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useCourseOptions, useTeacherOptions } from '../hooks/use-options.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Badge } from '../components/ui/badge.js'
import { Progress } from '../components/ui/progress.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import { classSchema, CLASS_STATUS_LABEL, type ClassDto, type ClassStatus, type Page } from '../../shared/domain.js'

const STATUS_VARIANT: Record<ClassStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  recruiting: 'outline', ongoing: 'default', finished: 'secondary', cancelled: 'destructive',
}

/** 班级管理：列表 + 新建/编辑/删除，点击进入班级详情（成员 + 排课）。 */
export function ClassesPage() {
  const navigate = useNavigate()
  const can = useAppStore((s) => s.can)
  const { options: courseOptions, courses } = useCourseOptions()
  const { options: teacherOptions } = useTeacherOptions()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ClassStatus | 'all'>('all')
  const { data, loading, reload } = useApi<Page<ClassDto>>(
    `/api/classes${qs({ pageSize: 100, keyword: search || undefined, status: status === 'all' ? undefined : status })}`,
    { deps: [search, status] },
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ClassDto | null>(null)
  const [deleting, setDeleting] = useState<ClassDto | null>(null)

  const fields: FieldSpec[] = [
    { name: 'name', label: '班级名称', type: 'text', required: true, placeholder: '如 数学冲刺1班' },
    { name: 'courseId', label: '所属课程', type: 'select', required: true, options: courseOptions },
    { name: 'teacherId', label: '任课教师', type: 'select', options: teacherOptions },
    { name: 'room', label: '上课教室', type: 'text', placeholder: '如 A101' },
    { name: 'capacity', label: '容量', type: 'number', min: 1 },
    { name: 'startDate', label: '开课日期', type: 'date' },
    { name: 'status', label: '状态', type: 'select', options: Object.entries(CLASS_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })) },
    { name: 'remark', label: '备注', type: 'textarea', colSpan: 2 },
  ]

  const colorOf = (courseId: string) => {
    const c = courses.find((x) => x.id === courseId)
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#eab308', '#6366f1']
    return COLORS[((c?.colorIndex ?? 1) - 1) % 8]
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/classes/${deleting.id}`)
      toast.success(`已删除班级「${deleting.name}」`); setDeleting(null); reload()
    } catch (e) { toastError(e) }
  }

  const columns: Column<ClassDto>[] = [
    {
      key: 'name', header: '班级',
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(c.courseId) }} />
          <div className="min-w-0">
            <div className="truncate font-medium">{c.name}</div>
            <div className="truncate text-xs text-muted-foreground">{c.courseName}{c.teacherName ? ` · ${c.teacherName}` : ''}</div>
          </div>
        </div>
      ),
    },
    { key: 'room', header: '教室', cell: (c) => <span className="text-sm">{c.room || '—'}</span> },
    {
      key: 'enrolled', header: '人数',
      cell: (c) => (
        <div className="w-28">
          <div className="mb-1 flex justify-between text-xs">
            <span className="tabular-nums">{c.enrolled}/{c.capacity}</span>
          </div>
          <Progress value={Math.min(100, (c.enrolled / c.capacity) * 100)} className="h-1.5" />
        </div>
      ),
    },
    { key: 'schedules', header: '排课', cell: (c) => <span className="flex items-center gap-1 text-sm text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{c.schedules.length}</span> },
    { key: 'status', header: '状态', cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{CLASS_STATUS_LABEL[c.status]}</Badge> },
    {
      key: 'actions', header: '', className: 'w-24 text-right',
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/classes/${c.id}`) }}><Users className="h-4 w-4" /></Button>
          {can('class:write') && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditing(c); setDialogOpen(true) }}><Pencil className="h-4 w-4" /></Button>}
          {can('class:delete') && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleting(c) }}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="班级管理" description={`共 ${data?.total ?? 0} 个班级`}>
        {can('class:write') && <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />新建班级</Button>}
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索班级 / 教室" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(CLASS_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(c) => c.id} loading={loading}
        onRowClick={(c) => navigate(`/classes/${c.id}`)} />

      <FormDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        title={editing ? '编辑班级' : '新建班级'} fields={fields} schema={classSchema as any}
        defaultValues={editing ? { ...editing } : { capacity: 30, status: 'recruiting', courseId: courseOptions[0]?.value, teacherId: '' }}
        endpoint="/api/classes" editId={editing?.id ?? null}
        onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({ ...v, capacity: Number(v.capacity) || 30 })}
      />
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="删除班级"
        description={`确定删除「${deleting?.name}」吗？将同时移除成员关系与排课。`} confirmText="删除" destructive onConfirm={handleDelete} />
    </div>
  )
}
