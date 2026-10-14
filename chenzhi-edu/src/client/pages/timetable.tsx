import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { qs } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useClassOptions } from '../hooks/use-options.js'
import { PageHeader } from '../components/page-header.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Button } from '../components/ui/button.js'
import { Card } from '../components/ui/card.js'
import { ScrollArea } from '../components/ui/scroll-area.js'
import { scheduleSchema, PERIODS, WEEKDAY_LABEL, periodRange, type ScheduleDto } from '../../shared/domain.js'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#eab308', '#6366f1']

/**
 * 课表（周视图网格）：列 = 周一~周日，行 = 节次。
 * 每个格子按 startPeriod~endPeriod 纵向合并渲染排课卡片（课程色 + 班级名 + 教室 + 教师）。
 * 顶部可按教学周过滤（weekStart~weekEnd 命中）。
 */
export function TimetablePage() {
  const can = useAppStore((s) => s.can)
  const { options: classOptions } = useClassOptions()
  const [week, setWeek] = useState(() => currentTeachingWeek())
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, loading, reload } = useApi<{ items: ScheduleDto[] }>(
    `/api/schedules${qs({ week })}`,
    { deps: [week] },
  )
  const schedules = data?.items ?? []

  // 网格：weekday(1-7) × periodIndex
  const grid = useMemo(() => {
    const cell: Record<string, ScheduleDto[]> = {}
    for (const s of schedules) {
      for (let p = s.startPeriod; p <= s.endPeriod; p++) {
        const key = `${s.weekday}-${p}`
        ;(cell[key] ??= []).push(s)
      }
    }
    return cell
  }, [schedules])

  const fields: FieldSpec[] = [
    { name: 'classId', label: '班级', type: 'select', required: true, options: classOptions },
    { name: 'weekday', label: '星期', type: 'select', required: true, options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: WEEKDAY_LABEL[d] })) },
    { name: 'startPeriod', label: '开始节次', type: 'select', required: true, options: PERIODS.map((p) => ({ value: String(p.index), label: `${p.label} ${p.start}` })) },
    { name: 'endPeriod', label: '结束节次', type: 'select', required: true, options: PERIODS.map((p) => ({ value: String(p.index), label: `${p.label} ${p.end}` })) },
    { name: 'weekStart', label: '起始周', type: 'number', min: 1, max: 30 },
    { name: 'weekEnd', label: '结束周', type: 'number', min: 1, max: 30 },
    { name: 'room', label: '教室', type: 'text', colSpan: 2, placeholder: '如 A101' },
  ]

  return (
    <div>
      <PageHeader title="课表" description="全校周课表 · 按教学周过滤">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setWeek((w) => Math.max(1, w - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[80px] px-2 text-center text-sm font-medium tabular-nums">第 {week} 周</span>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setWeek((w) => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {can('schedule:write') && <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />排课</Button>}
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <ScrollArea className="w-full">
          <div className="min-w-[900px]">
            {/* 表头：星期 */}
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border bg-muted/40">
              <div className="border-r border-border p-2 text-center text-xs font-medium text-muted-foreground">节次</div>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <div key={d} className="border-r border-border p-2 text-center text-sm font-semibold last:border-r-0">
                  {WEEKDAY_LABEL[d]}
                </div>
              ))}
            </div>

            {/* 行：每个节次 */}
            {PERIODS.map((period) => (
              <div key={period.index} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border last:border-b-0">
                {/* 节次标签 */}
                <div className="flex flex-col items-center justify-center gap-0.5 border-r border-border bg-muted/20 p-2">
                  <span className="text-xs font-semibold">{period.label.replace('第', '').replace('节', '')}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{period.start}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{period.end}</span>
                </div>
                {/* 7 天格子 */}
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const items = grid[`${day}-${period.index}`] ?? []
                  // 只在跨节的起始节渲染卡片（避免重复），用 rowSpan 视觉合并
                  const starts = items.filter((s) => s.startPeriod === period.index)
                  const passing = items.filter((s) => s.startPeriod !== period.index)
                  const span = starts[0] ? starts[0].endPeriod - starts[0].startPeriod + 1 : 1
                  return (
                    <div key={day} className="relative min-h-[72px] border-r border-border p-1 last:border-r-0">
                      {starts.map((s) => (
                        <div
                          key={s.id}
                          className="absolute inset-x-1 top-1 overflow-hidden rounded-md p-1.5 text-white shadow-sm"
                          style={{
                            background: COLORS[(s.courseColor - 1) % 8],
                            height: `calc(${span} * 72px + ${(span - 1)} * 0px - 8px)`,
                            minHeight: 'calc(72px - 8px)',
                          }}
                          title={`${s.courseName} · ${s.className}\n${periodRange(s.startPeriod, s.endPeriod)}\n${s.room ?? ''} ${s.teacherName ?? ''}`}
                        >
                          <div className="truncate text-xs font-semibold leading-tight">{s.courseName}</div>
                          <div className="truncate text-[10px] opacity-90">{s.className}</div>
                          <div className="mt-0.5 truncate text-[10px] opacity-80">{s.room ?? '—'}</div>
                          <div className="truncate text-[10px] opacity-80">{s.teacherName ?? ''}</div>
                        </div>
                      ))}
                      {/* 被跨越的节次留空（卡片绝对定位覆盖） */}
                      {passing.length > 0 && starts.length === 0 && null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span>本周共 {schedules.length} 节排课</span>
        {loading && <span>· 加载中…</span>}
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="新增排课"
        description="系统会自动检测教室/教师冲突"
        fields={fields}
        schema={scheduleSchema as any}
        defaultValues={{ weekday: '1', startPeriod: '1', endPeriod: '2', weekStart: 1, weekEnd: 16, classId: classOptions[0]?.value }}
        endpoint="/api/schedules"
        editId={null}
        onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({
          ...v,
          weekday: Number(v.weekday), startPeriod: Number(v.startPeriod), endPeriod: Number(v.endPeriod),
          weekStart: Number(v.weekStart) || 1, weekEnd: Number(v.weekEnd) || 20,
        })}
      />
    </div>
  )
}

/** 按当前日期估算教学周（简化：以 9 月初为第 1 周）。 */
function currentTeachingWeek(): number {
  const now = new Date()
  // 以当年 9 月 1 日为学期起点
  const start = new Date(now.getFullYear(), 8, 1)
  const diff = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000)) + 1
  return diff > 0 && diff <= 30 ? diff : 1
}
