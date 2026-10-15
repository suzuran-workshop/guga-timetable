import { useState } from 'react'
import { ChevronLeft, ChevronRight, Ban, UserCog, ArrowLeftRight, RotateCcw, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useTermContext } from '../hooks/use-term.js'
import { useClassOptions, useTeacherOptions } from '../hooks/use-options.js'
import { PageHeader } from '../components/page-header.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Badge } from '../components/ui/badge.js'
import { Input } from '../components/ui/input.js'
import { Skeleton } from '../components/ui/skeleton.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import {
  toISODate, parseDate, periodRange, weekdayOfDate, WEEKDAY_LABEL,
  LESSON_STATUS_LABEL, type ResolvedLesson, type LessonStatus,
} from '@guga/shared'
import { cn } from '../lib/utils.js'

const STATUS_STYLE: Record<LessonStatus, string> = {
  normal: 'border-border bg-card',
  cancelled: 'border-rose-300 bg-rose-50 dark:bg-rose-950/30 opacity-70',
  moved_out: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 opacity-70',
  moved_in: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  substituted: 'border-sky-300 bg-sky-50 dark:bg-sky-950/30',
}
const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  normal: 'secondary', cancelled: 'destructive', moved_out: 'outline',
  moved_in: 'default', substituted: 'secondary',
}

/** 日期加减 N 天 */
function shiftDate(iso: string, days: number): string {
  return toISODate(parseDate(iso) + days * 86400_000)
}

/**
 * 调换课（单日课表）：选日期 → 展示当日实际课次（已套用例外）→ 停课/代课/对调/撤销。
 * 这是「具体某一次课」的操作台，与 /timetable（循环周课表）互补。
 */
export function ScheduleAdjustPage() {
  const can = useAppStore((s) => s.can)
  const { term } = useTermContext()
  const { options: teacherOptions } = useTeacherOptions()
  const [date, setDate] = useState(() => toISODate(Date.now()))
  const [classId, setClassId] = useState<string>('all')
  const { options: classOptions } = useClassOptions()

  const { data, loading, reload } = useApi<{ date: string; items: ResolvedLesson[] }>(
    `/api/schedule-exceptions/day${qs({ date, classId: classId && classId !== 'all' ? classId : undefined })}`,
    { deps: [date, classId] },
  )
  const lessons = data?.items ?? []

  // 对调对话框状态
  const [swapFor, setSwapFor] = useState<ResolvedLesson | null>(null)
  const [swapTargetDate, setSwapTargetDate] = useState('')
  const [swapTargetLesson, setSwapTargetLesson] = useState('')
  const [swapReason, setSwapReason] = useState('')
  // 代课对话框
  const [subFor, setSubFor] = useState<ResolvedLesson | null>(null)
  const [subTeacher, setSubTeacher] = useState('')
  const [subReason, setSubReason] = useState('')

  const weekday = weekdayOfDate(date)
  const weekInfo = term
    ? `第 ${currentWeekFor(date, term.startDate, term.totalWeeks)} 周 · ${WEEKDAY_LABEL[weekday]}`
    : WEEKDAY_LABEL[weekday]

  const doCancel = async (l: ResolvedLesson) => {
    try {
      await api.post('/api/schedule-exceptions/cancel', { scheduleId: l.scheduleId, date: l.date, reason: '停课' })
      toast.success('已停课'); reload()
    } catch (e) { toastError(e) }
  }
  const doClear = async (l: ResolvedLesson) => {
    try {
      await api.post('/api/schedule-exceptions/occurrence/clear', { scheduleId: l.scheduleId, date: l.date })
      toast.success('已恢复正常排课'); reload()
    } catch (e) { toastError(e) }
  }
  const doSubstitute = async () => {
    if (!subFor || !subTeacher) return toast.error('请选择代课教师')
    try {
      await api.post('/api/schedule-exceptions/substitute', { scheduleId: subFor.scheduleId, date: subFor.date, teacherId: subTeacher, reason: subReason })
      toast.success('已安排代课'); setSubFor(null); setSubTeacher(''); setSubReason(''); reload()
    } catch (e) { toastError(e) }
  }
  const doSwap = async () => {
    if (!swapFor || !swapTargetDate) return toast.error('请选择目标日期')
    // 目标课：从目标日期解析出的课次里选
    try {
      const targetRes = await api.get<{ items: ResolvedLesson[] }>(`/api/schedule-exceptions/day${qs({ date: swapTargetDate })}`)
      const target = targetRes.items.find((x) => x.key === swapTargetLesson)
      if (!target) return toast.error('请选择要对调的目标课次')
      const res = await api.post<{ ok: boolean; message?: string }>('/api/schedule-exceptions/swap', {
        scheduleIdA: swapFor.scheduleId, dateA: swapFor.date,
        scheduleIdB: target.scheduleId, dateB: target.date, reason: swapReason,
      })
      if (res.ok) { toast.success('对调成功'); setSwapFor(null); setSwapTargetDate(''); setSwapTargetLesson(''); setSwapReason(''); reload() }
    } catch (e) { toastError(e) }
  }

  return (
    <div>
      <PageHeader title="调换课" description="按具体日期管理单次课：停课 / 代课 / 对调" />

      {/* 日期选择 + 班级过滤 */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center rounded-md border border-border">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setDate(shiftDate(date, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-9 w-40 border-0 text-center focus-visible:ring-0" />
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setDate(shiftDate(date, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDate(toISODate(Date.now()))}>回到今天</Button>
          <div className="text-sm text-muted-foreground">{weekInfo}</div>
          <div className="sm:ml-auto">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="全部班级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部班级</SelectItem>
                {classOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 当日课次 */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !lessons.length ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{date} 当天无课</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {lessons.map((l) => (
            <Card key={l.key} className={cn('overflow-hidden', STATUS_STYLE[l.status])}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-14 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
                    <span className="text-xs font-semibold tabular-nums">{l.startPeriod}-{l.endPeriod}</span>
                    <span className="text-[10px] text-muted-foreground">{periodRange(l.startPeriod, l.endPeriod).split('-')[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium', l.status === 'cancelled' && 'line-through')}>{l.courseName}</span>
                      <Badge variant={STATUS_BADGE[l.status]}>{LESSON_STATUS_LABEL[l.status]}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {l.className} · {l.room ?? '未定教室'} · {l.teacherName ?? '未定教师'}
                      {l.reason && <span className="ml-2 text-amber-600">（{l.reason}）</span>}
                    </div>
                  </div>
                </div>
                {can('schedule:write') && (
                  <div className="flex flex-wrap gap-1.5">
                    {l.status === 'normal' && (
                      <>
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => { setSwapFor(l); setSwapTargetDate(shiftDate(date, 1)) }}>
                          <ArrowLeftRight className="h-3.5 w-3.5" />对调
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => { setSubFor(l); setSubTeacher('') }}>
                          <UserCog className="h-3.5 w-3.5" />代课
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs text-rose-600 hover:text-rose-700" onClick={() => doCancel(l)}>
                          <Ban className="h-3.5 w-3.5" />停课
                        </Button>
                      </>
                    )}
                    {l.status !== 'normal' && l.status !== 'moved_in' && (
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => doClear(l)}>
                        <RotateCcw className="h-3.5 w-3.5" />恢复
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 对调对话框 */}
      <SwapDialog
        open={!!swapFor} onOpenChange={(v) => !v && setSwapFor(null)}
        lesson={swapFor} targetDate={swapTargetDate} setTargetDate={setSwapTargetDate}
        targetLesson={swapTargetLesson} setTargetLesson={setSwapTargetLesson}
        reason={swapReason} setReason={setSwapReason} onConfirm={doSwap}
      />

      {/* 代课对话框 */}
      <Dialog open={!!subFor} onOpenChange={(v) => !v && setSubFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>安排代课</DialogTitle>
            <DialogDescription>
              {subFor?.courseName} · {subFor?.className} · {subFor?.date}（原教师 {subFor?.teacherName ?? '—'}）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">代课教师</label>
              <Select value={subTeacher} onValueChange={setSubTeacher}>
                <SelectTrigger><SelectValue placeholder="选择教师" /></SelectTrigger>
                <SelectContent>{teacherOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">原因（选填）</label>
              <Input value={subReason} onChange={(e) => setSubReason(e.target.value)} placeholder="如：教师请假" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubFor(null)}>取消</Button>
            <Button onClick={doSubstitute}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 对调对话框：选目标日期 → 拉取该日课次 → 选目标课 → 填原因 → 确认 */
function SwapDialog({
  open, onOpenChange, lesson, targetDate, setTargetDate, targetLesson, setTargetLesson, reason, setReason, onConfirm,
}: {
  open: boolean; onOpenChange: (v: boolean) => void
  lesson: ResolvedLesson | null
  targetDate: string; setTargetDate: (v: string) => void
  targetLesson: string; setTargetLesson: (v: string) => void
  reason: string; setReason: (v: string) => void
  onConfirm: () => void
}) {
  const { data } = useApi<{ items: ResolvedLesson[] }>(
    open && targetDate ? `/api/schedule-exceptions/day${qs({ date: targetDate })}` : null,
    { deps: [targetDate, open] },
  )
  // 目标课次候选：排除自身、排除已取消/调出的
  const candidates = (data?.items ?? []).filter((x) =>
    x.scheduleId !== lesson?.scheduleId && x.status !== 'cancelled' && x.status !== 'moved_out')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>对调课次</DialogTitle>
          <DialogDescription>
            将「{lesson?.courseName} · {lesson?.className}」（{lesson?.date} {periodRange(lesson?.startPeriod ?? 0, lesson?.endPeriod ?? 0)}）
            与另一天的课对调时段。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">目标日期</label>
            <Input type="date" value={targetDate} onChange={(e) => { setTargetDate(e.target.value); setTargetLesson('') }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">对调对象（{targetDate} 的课）</label>
            {candidates.length ? (
              <Select value={targetLesson} onValueChange={setTargetLesson}>
                <SelectTrigger><SelectValue placeholder="选择要对调的课次" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((x) => (
                    <SelectItem key={x.key} value={x.key}>
                      {x.courseName} · {x.className} · P{x.startPeriod}-{x.endPeriod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">该日期暂无可对调的课次</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">原因（选填）</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：期中调课" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onConfirm} disabled={!targetLesson}>确定对调</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 本地计算某日期在学期中的教学周（与后端 weekOfDate 同算法，避免额外请求） */
function currentWeekFor(iso: string, termStart: string, totalWeeks: number): number {
  const diff = Math.round((parseDate(iso) - parseDate(termStart)) / 86400_000)
  if (diff < 0) return 0
  const w = Math.floor(diff / 7) + 1
  return w > totalWeeks ? totalWeeks : w
}
