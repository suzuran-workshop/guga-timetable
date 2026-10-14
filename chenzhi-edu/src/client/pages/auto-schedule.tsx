import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, CalendarDays, ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../lib/api.js'
import { useAppStore } from '../store/app.js'
import { useClassOptions } from '../hooks/use-options.js'
import { useTermContext } from '../hooks/use-term.js'
import { PageHeader } from '../components/page-header.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import { Checkbox } from '../components/ui/checkbox.js'
import { Badge } from '../components/ui/badge.js'
import { Separator } from '../components/ui/separator.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { WEEKDAY_LABEL, periodRange, type AutoScheduleResult } from '../../shared/domain.js'
import { cn } from '../lib/utils.js'

/** POST /api/schedules/auto 的响应体，契约单一源在 shared/domain.ts。 */
type AutoResult = AutoScheduleResult

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

/**
 * 自动派课：选班级 + 配约束（每周课时/连堂节数/教学周段/星期/教室池）
 * → 后端贪心+回溯搜索出无冲突排课 → 展示排入与失败明细。
 *
 * all-or-nothing：要么全部排入，要么一节不落库并如实报告失败原因。
 */
export function AutoSchedulePage() {
  const can = useAppStore((s) => s.can)
  const navigate = useNavigate()
  const { classes, loading: classesLoading } = useClassOptions()
  const { totalWeeks } = useTermContext()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lessonsPerWeek, setLessonsPerWeek] = useState(2)
  const [periodsPerLesson, setPeriodsPerLesson] = useState(2)
  const [weekStart, setWeekStart] = useState(1)
  const [weekEnd, setWeekEnd] = useState(20)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [roomsText, setRoomsText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AutoResult | null>(null)

  const canWrite = can('schedule:write')

  const toggleClass = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
  }

  const selectAll = () => setSelected(new Set(classes.map((c) => c.id)))
  const clearAll = () => setSelected(new Set())

  const handleRun = async () => {
    if (!selected.size) {
      toast.error('请至少选择一个班级')
      return
    }
    // 教室池：中英文逗号皆可，去空
    const rooms = roomsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    setRunning(true)
    try {
      const res = await api.post<AutoResult>('/api/schedules/auto', {
        classIds: [...selected],
        lessonsPerWeek: Number(lessonsPerWeek),
        periodsPerLesson: Number(periodsPerLesson),
        weekStart: Number(weekStart),
        weekEnd: Number(weekEnd),
        weekdays,
        rooms,
      })
      setResult(res)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    } catch (e) {
      toastError(e)
    } finally {
      setRunning(false)
    }
  }

  // 结果配色：全成功=绿；部分成功=琥珀；全失败=玫红
  const tone = result
    ? result.ok
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : result.placed.length > 0
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
    : ''

  return (
    <div>
      <PageHeader
        title="自动派课"
        description="按约束自动为选定班级批量生成无冲突排课（贪心 + 回溯，全成功才落库）"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ---------- 左：配置 ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" />排课参数
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 班级多选 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  选择班级
                  <Badge variant="secondary" className="tabular-nums">已选 {selected.size} 个</Badge>
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll} disabled={!classes.length}>
                    全选
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll} disabled={!selected.size}>
                    清空
                  </Button>
                </div>
              </div>

              {classesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !classes.length ? (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  暂无班级，请先在「班级管理」中创建
                </p>
              ) : (
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {classes.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        'flex items-start gap-2.5 rounded-md border p-2.5 transition-colors',
                        selected.has(c.id) ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <Checkbox
                        id={`as-class-${c.id}`}
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggleClass(c.id)}
                        className="mt-0.5"
                      />
                      <label htmlFor={`as-class-${c.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.courseName}
                          {c.teacherName ? ` · ${c.teacherName}` : ''}
                          {c.room ? ` · ${c.room}` : ''}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* 课时与节次 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="as-lessons-per-week" className="text-sm font-medium">每班每周课时数</label>
                <Input
                  id="as-lessons-per-week"
                  type="number"
                  min={1}
                  max={20}
                  value={lessonsPerWeek}
                  onChange={(e) => setLessonsPerWeek(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">每班每周排几次课（1~20）</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="as-periods-per-lesson" className="text-sm font-medium">每次课连堂节数</label>
                <Input
                  id="as-periods-per-lesson"
                  type="number"
                  min={1}
                  max={6}
                  value={periodsPerLesson}
                  onChange={(e) => setPeriodsPerLesson(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">如 2 表示每次课占连续两节</p>
              </div>
            </div>

            {/* 教学周段 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="as-week-start" className="text-sm font-medium">起始周</label>
                <Input
                  id="as-week-start"
                  type="number"
                  min={1}
                  max={totalWeeks}
                  value={weekStart}
                  onChange={(e) => setWeekStart(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="as-week-end" className="text-sm font-medium">结束周</label>
                <Input
                  id="as-week-end"
                  type="number"
                  min={1}
                  max={totalWeeks}
                  value={weekEnd}
                  onChange={(e) => setWeekEnd(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">当前学期共 {totalWeeks} 周</p>
              </div>
            </div>

            {/* 星期范围 */}
            <div className="space-y-2">
              <div className="text-sm font-medium">可排课的星期</div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = weekdays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-label={WEEKDAY_LABEL[d]}
                      aria-pressed={active}
                      onClick={() => toggleWeekday(d)}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {WEEKDAY_LABEL[d]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 教室池 */}
            <div className="space-y-1.5">
              <label htmlFor="as-rooms" className="text-sm font-medium">教室池（逗号分隔，选填）</label>
              <Input
                id="as-rooms"
                value={roomsText}
                onChange={(e) => setRoomsText(e.target.value)}
                placeholder="如 A101, A102, B201"
              />
              <p className="text-xs text-muted-foreground">
                班级已设置教室时优先使用班级教室；此处为无固定教室的班级分配
              </p>
            </div>

            <Separator />

            {/* 运行 */}
            <div className="space-y-2">
              <Button type="button" className="w-full" onClick={handleRun} disabled={!selected.size || running || !canWrite}>
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {running ? '排课中…' : '开始自动派课'}
              </Button>
              {!canWrite && (
                <p className="text-center text-xs text-amber-600 dark:text-amber-500">
                  当前账号无排课权限（需要 schedule:write）
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---------- 右：结果 ---------- */}
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />派课结果
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <Sparkles className="h-9 w-9 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">配置左侧参数后开始派课</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 结论 callout */}
                <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm', tone)}>
                  {result.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : result.placed.length > 0 ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span className="leading-snug">{result.message}</span>
                </div>

                {/* 统计 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border p-2 text-center">
                    <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{result.placed.length}</div>
                    <div className="text-[11px] text-muted-foreground">成功排入(节)</div>
                  </div>
                  <div className="rounded-lg border border-border p-2 text-center">
                    <div className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">{result.failed.length}</div>
                    <div className="text-[11px] text-muted-foreground">失败(节)</div>
                  </div>
                  <div className="rounded-lg border border-border p-2 text-center">
                    <div className="text-lg font-bold tabular-nums">{result.backtracks}</div>
                    <div className="text-[11px] text-muted-foreground">回溯次数</div>
                  </div>
                </div>

                {/* 已排入 */}
                {result.placed.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">已排入</div>
                    <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
                      {result.placed.map((p, i) => (
                        <div key={`${p.classId}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                          <span className="min-w-0 truncate text-sm">{p.className}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {WEEKDAY_LABEL[p.slot.weekday]} {periodRange(p.slot.startPeriod, p.slot.endPeriod)}
                            <span className="ml-1.5">{p.room ?? '未定教室'}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 失败明细 */}
                {result.failed.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">失败明细</div>
                    <div className="max-h-[200px] space-y-1 overflow-y-auto pr-1">
                      {result.failed.map((f, i) => (
                        <div key={`${f.classId}-${i}`} className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5">
                          <div className="text-sm">{f.className}</div>
                          <div className="text-xs text-rose-600 dark:text-rose-400">{f.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.ok && (
                  <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/timetable')}>
                    查看课表
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
