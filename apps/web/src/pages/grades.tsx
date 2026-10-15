import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Award } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useClassOptions } from '../hooks/use-options.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import { gradeSchema, type GradeDto, type Page } from '../../shared/domain.js'

/** 按得分率给成绩着色：绿 >=85%，琥珀 >=60%，红 <60%。 */
function scoreColor(score: number, full: number): string {
  const ratio = full > 0 ? score / full : 0
  if (ratio >= 0.85) return 'text-emerald-600 dark:text-emerald-400'
  if (ratio >= 0.6) return 'text-amber-600 dark:text-amber-400'
  return 'text-destructive'
}

/** 成绩管理：班级/考试筛选 + 表格 + 新建/编辑/删除。 */
export function GradesPage() {
  const can = useAppStore((s) => s.can)
  const { options: classOptions } = useClassOptions()

  // 筛选状态（committed）与输入框草稿
  const [classId, setClassId] = useState<string>('all')
  const [examName, setExamName] = useState('')
  const [examKeyword, setExamKeyword] = useState('')

  const { data, loading, reload } = useApi<Page<GradeDto>>(
    `/api/grades${qs({ pageSize: 100, classId: classId === 'all' ? undefined : classId, examName: examName || undefined })}`,
    { deps: [classId, examName] },
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<GradeDto | null>(null)
  const [deleting, setDeleting] = useState<GradeDto | null>(null)

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/grades/${deleting.id}`)
      toast.success(`已删除「${deleting.studentName} · ${deleting.examName}」的成绩`)
      setDeleting(null)
      reload()
    } catch (e) {
      toastError(e)
    }
  }

  const fields: FieldSpec[] = [
    { name: 'studentId', label: '学员ID', type: 'text', required: true, placeholder: '学员ID' },
    { name: 'classId', label: '所属班级', type: 'select', options: [{ value: '', label: '不关联班级' }, ...classOptions] },
    { name: 'examName', label: '考试名称', type: 'text', required: true, placeholder: '如 第一次月考' },
    { name: 'score', label: '得分', type: 'number', required: true, min: 0 },
    { name: 'fullScore', label: '满分', type: 'number', min: 1 },
    { name: 'examDate', label: '考试日期', type: 'date', required: true },
    { name: 'remark', label: '备注', type: 'textarea', colSpan: 2 },
  ]

  const columns: Column<GradeDto>[] = [
    {
      key: 'student', header: '学员',
      cell: (g) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
            {g.studentName.slice(0, 1)}
          </div>
          <span className="truncate font-medium">{g.studentName}</span>
        </div>
      ),
    },
    { key: 'class', header: '班级', cell: (g) => <span className="text-sm">{g.className || '—'}</span> },
    { key: 'exam', header: '考试', cell: (g) => <span className="text-sm">{g.examName}</span> },
    {
      key: 'score', header: '成绩',
      cell: (g) => (
        <span className={`text-sm font-semibold tabular-nums ${scoreColor(g.score, g.fullScore)}`}>
          {g.score} / {g.fullScore}
        </span>
      ),
    },
    { key: 'date', header: '日期', cell: (g) => <span className="text-sm tabular-nums text-muted-foreground">{g.examDate}</span> },
    {
      key: 'actions', header: '', className: 'w-20 text-right',
      cell: (g) => (
        <div className="flex justify-end gap-1">
          {can('grade:write') && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditing(g); setDialogOpen(true) }}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can('grade:delete') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleting(g) }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const total = data?.total ?? 0

  return (
    <div>
      <PageHeader title="成绩管理" description={`共 ${total} 条成绩记录`}>
        {can('grade:write') && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />新建成绩
          </Button>
        )}
      </PageHeader>

      {/* 筛选工具栏 */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="全部班级" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部班级</SelectItem>
            {classOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索考试名称"
            value={examKeyword}
            onChange={(e) => setExamKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setExamName(examKeyword) }}
          />
        </div>
        <Button variant="secondary" onClick={() => setExamName(examKeyword)}>搜索</Button>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(g) => g.id}
        loading={loading}
        empty={<span className="flex flex-col items-center gap-2"><Award className="h-8 w-8 text-muted-foreground/30" />暂无成绩记录</span>}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? '编辑成绩' : '新建成绩'}
        fields={fields}
        schema={gradeSchema as any}
        defaultValues={
          (editing
            ? {
                studentId: editing.studentId,
                classId: editing.classId ?? '',
                examName: editing.examName,
                score: editing.score,
                fullScore: editing.fullScore,
                examDate: editing.examDate,
                remark: editing.remark ?? '',
              }
            : { fullScore: 100, classId: '' }) as any
        }
        endpoint="/api/grades"
        editId={editing?.id ?? null}
        onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({ ...v, score: Number(v.score), fullScore: Number(v.fullScore) || 100 })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="删除成绩"
        description={`确定删除「${deleting?.studentName} · ${deleting?.examName}」的成绩吗？此操作不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
