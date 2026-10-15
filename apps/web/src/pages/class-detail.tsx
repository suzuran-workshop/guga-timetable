import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, UserPlus, Trash2, Users, CalendarDays, MapPin, GraduationCap,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Badge } from '../components/ui/badge.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { Progress } from '../components/ui/progress.js'
import { DataTable, type Column } from '../components/data-table.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog.js'
import { Input } from '../components/ui/input.js'
import {
  CLASS_STATUS_LABEL, scheduleSchema, PERIODS, WEEKDAY_LABEL, periodRange,
  type ClassDto, type ScheduleDto,
} from '../../shared/domain.js'

interface Member {
  id: string; name: string; studentNo: string; phone: string | null
  balanceLessons: number; status: string; joinedAt: number
}

/** 班级详情：班级信息 + 成员管理（增删）+ 排课管理（增删，带冲突检测）。 */
export function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const can = useAppStore((s) => s.can)

  const { data: cls, loading, reload } = useApi<ClassDto>(id ? `/api/classes/${id}` : null, { deps: [id] })
  const { data: membersResp, reload: reloadMembers } = useApi<{ items: Member[] }>(
    id ? `/api/classes/${id}/members` : null, { deps: [id] },
  )
  const { data: schedsResp, reload: reloadScheds } = useApi<{ items: ScheduleDto[] }>(
    id ? `/api/classes/${id}/schedules` : null, { deps: [id] },
  )

  const [removing, setRemoving] = useState<Member | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addStudentNo, setAddStudentNo] = useState('')
  const [adding, setAdding] = useState(false)
  const [schedOpen, setSchedOpen] = useState(false)
  const [removingSched, setRemovingSched] = useState<ScheduleDto | null>(null)

  const members = membersResp?.items ?? []
  const schedules = schedsResp?.items ?? []

  // 添加成员：按学号查找学员
  const handleAddMember = async () => {
    if (!id || !addStudentNo.trim()) return toast.error('请输入学号')
    setAdding(true)
    try {
      const found = await api.get<{ items: { id: string; name: string }[] }>(
        `/api/students?keyword=${encodeURIComponent(addStudentNo.trim())}&pageSize=1`,
      )
      if (!found.items.length) return toast.error('未找到该学号的学员')
      await api.post(`/api/classes/${id}/members`, { studentId: found.items[0].id })
      toast.success(`已添加「${found.items[0].name}」`)
      setAddOpen(false); setAddStudentNo(''); reload(); reloadMembers()
    } catch (e) {
      toastError(e)
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!removing || !id) return
    try {
      await api.del(`/api/classes/${id}/members/${removing.id}`)
      toast.success(`已移除「${removing.name}」`); setRemoving(null); reload(); reloadMembers()
    } catch (e) { toastError(e) }
  }

  const handleRemoveSched = async () => {
    if (!removingSched) return
    try {
      await api.del(`/api/schedules/${removingSched.id}`)
      toast.success('已删除排课'); setRemovingSched(null); reloadScheds()
    } catch (e) { toastError(e) }
  }

  const schedFields: FieldSpec[] = [
    { name: 'weekday', label: '星期', type: 'select', required: true, options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: WEEKDAY_LABEL[d] })) },
    { name: 'startPeriod', label: '开始节次', type: 'select', required: true, options: PERIODS.map((p) => ({ value: String(p.index), label: `${p.label} ${p.start}` })) },
    { name: 'endPeriod', label: '结束节次', type: 'select', required: true, options: PERIODS.map((p) => ({ value: String(p.index), label: `${p.label} ${p.end}` })) },
    { name: 'weekStart', label: '起始周', type: 'number', min: 1, max: 30 },
    { name: 'weekEnd', label: '结束周', type: 'number', min: 1, max: 30 },
    { name: 'room', label: '教室', type: 'text', colSpan: 2, placeholder: cls?.room ?? '如 A101' },
  ]

  if (loading || !cls) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
  }

  const memberColumns: Column<Member>[] = [
    {
      key: 'name', header: '学员',
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{m.name.slice(0, 1)}</div>
          <div><div className="font-medium">{m.name}</div><div className="text-xs text-muted-foreground">{m.studentNo}</div></div>
        </div>
      ),
    },
    { key: 'phone', header: '电话', cell: (m) => <span className="text-sm text-muted-foreground">{m.phone || '—'}</span> },
    { key: 'balance', header: '剩余课时', cell: (m) => <Badge variant={m.balanceLessons <= 3 ? 'destructive' : 'secondary'} className="tabular-nums">{m.balanceLessons}</Badge> },
    {
      key: 'actions', header: '', className: 'w-12 text-right',
      cell: (m) => can('class:write') ? (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); setRemoving(m) }}><Trash2 className="h-4 w-4" /></Button>
      ) : null,
    },
  ]

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => navigate('/classes')}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />返回班级列表
      </Button>

      <PageHeader title={cls.name} description={`${cls.courseName}${cls.teacherName ? ` · ${cls.teacherName}` : ''}`}>
        {can('class:write') && (
          <>
            <Button variant="outline" onClick={() => setSchedOpen(true)}><CalendarDays className="mr-2 h-4 w-4" />排课</Button>
            <Button onClick={() => setAddOpen(true)}><UserPlus className="mr-2 h-4 w-4" />添加学员</Button>
          </>
        )}
      </PageHeader>

      {/* 班级概览 */}
      <Card className="mb-6">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-sm text-muted-foreground">状态</p><Badge className="mt-1" variant={cls.status === 'ongoing' ? 'default' : 'secondary'}>{CLASS_STATUS_LABEL[cls.status]}</Badge></div>
          <div><p className="text-sm text-muted-foreground">任课教师</p><p className="mt-1 flex items-center gap-1.5 font-medium"><GraduationCap className="h-4 w-4 text-muted-foreground" />{cls.teacherName || '—'}</p></div>
          <div><p className="text-sm text-muted-foreground">上课教室</p><p className="mt-1 flex items-center gap-1.5 font-medium"><MapPin className="h-4 w-4 text-muted-foreground" />{cls.room || '—'}</p></div>
          <div>
            <p className="text-sm text-muted-foreground">人数 {cls.enrolled}/{cls.capacity}</p>
            <Progress value={Math.min(100, (cls.enrolled / cls.capacity) * 100)} className="mt-2 h-2" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 成员 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />班级成员（{members.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={memberColumns} rows={members} rowKey={(m) => m.id} empty="暂无成员，点击「添加学员」" />
          </CardContent>
        </Card>

        {/* 排课 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />排课安排（{schedules.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {schedules.length ? schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{WEEKDAY_LABEL[s.weekday]}</Badge>
                    <span className="text-sm font-medium">{periodRange(s.startPeriod, s.endPeriod)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    第 {s.weekStart}~{s.weekEnd} 周 · {s.room || cls.room || '未定教室'}
                  </div>
                </div>
                {can('schedule:write') && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRemovingSched(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无排课，点击「排课」添加</p>}
          </CardContent>
        </Card>
      </div>

      {/* 添加学员对话框 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>添加学员到班级</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">学员学号</label>
            <Input value={addStudentNo} onChange={(e) => setAddStudentNo(e.target.value)}
              placeholder="输入学号，如 S1001" onKeyDown={(e) => e.key === 'Enter' && handleAddMember()} />
            <p className="text-xs text-muted-foreground">按学号精确匹配学员后加入本班</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
            <Button onClick={handleAddMember} disabled={adding}>{adding ? '添加中…' : '添加'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 排课对话框（冲突时后端返回 409，FormDialog 会 toast 错误） */}
      <FormDialog
        open={schedOpen} onOpenChange={setSchedOpen}
        title="为班级排课" description="系统会自动检测教室/教师冲突"
        fields={schedFields} schema={scheduleSchema as any}
        defaultValues={{ weekday: '1', startPeriod: '1', endPeriod: '2', weekStart: 1, weekEnd: 16, room: cls.room ?? '' } as any}
        endpoint="/api/schedules" editId={null}
        onSaved={() => { setSchedOpen(false); reloadScheds() }}
        transform={(v) => ({ ...v, classId: id, weekday: Number(v.weekday), startPeriod: Number(v.startPeriod), endPeriod: Number(v.endPeriod), weekStart: Number(v.weekStart) || 1, weekEnd: Number(v.weekEnd) || 20 })}
      />

      <ConfirmDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)} title="移出班级"
        description={`确定将「${removing?.name}」移出本班吗？`} confirmText="移出" destructive onConfirm={handleRemoveMember} />
      <ConfirmDialog open={!!removingSched} onOpenChange={(v) => !v && setRemovingSched(null)} title="删除排课"
        description="确定删除这条排课吗？" confirmText="删除" destructive onConfirm={handleRemoveSched} />
    </div>
  )
}
