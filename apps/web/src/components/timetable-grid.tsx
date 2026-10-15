import { useMemo } from 'react'
import { ScrollArea } from './ui/scroll-area.js'
import { PERIODS, WEEKDAY_LABEL, periodRange, type ScheduleDto } from '@guga/shared'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#eab308', '#6366f1']

/**
 * 周课表网格（列=周一~周日，行=节次）。
 * 排课卡片按 startPeriod~endPeriod 绝对定位跨行；课程色取 colorIndex。
 * 全局/教师/班级三维度共用本组件，只是喂入的 schedules 不同。
 */
export function TimetableGrid({ schedules, onSelect }: {
  schedules: ScheduleDto[]
  onSelect?: (s: ScheduleDto) => void
}) {
  // 网格：`weekday-period` → 该节次的排课（含跨节）
  const grid = useMemo(() => {
    const cell: Record<string, ScheduleDto[]> = {}
    for (const s of schedules) {
      for (let p = s.startPeriod; p <= s.endPeriod; p++) {
        ;(cell[`${s.weekday}-${p}`] ??= []).push(s)
      }
    }
    return cell
  }, [schedules])

  return (
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
            <div className="flex flex-col items-center justify-center gap-0.5 border-r border-border bg-muted/20 p-2">
              <span className="text-xs font-semibold">{period.label.replace('第', '').replace('节', '')}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{period.start}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{period.end}</span>
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const items = grid[`${day}-${period.index}`] ?? []
              const starts = items.filter((s) => s.startPeriod === period.index)
              return (
                <div key={day} className="relative min-h-[72px] border-r border-border p-1 last:border-r-0">
                  {starts.map((s) => {
                    const span = s.endPeriod - s.startPeriod + 1
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => onSelect?.(s)}
                        className="absolute inset-x-1 top-1 overflow-hidden rounded-md p-1.5 text-left text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-default"
                        disabled={!onSelect}
                        style={{
                          background: COLORS[(s.courseColor - 1) % 8],
                          height: `calc(${span} * 72px - 8px)`,
                          minHeight: 'calc(72px - 8px)',
                        }}
                        title={`${s.courseName} · ${s.className}\n${periodRange(s.startPeriod, s.endPeriod)}\n${s.room ?? ''} ${s.teacherName ?? ''}`}
                      >
                        <div className="truncate text-xs font-semibold leading-tight">{s.courseName}</div>
                        <div className="truncate text-[10px] opacity-90">{s.className}</div>
                        <div className="mt-0.5 truncate text-[10px] opacity-80">{s.room ?? '—'}</div>
                        <div className="truncate text-[10px] opacity-80">{s.teacherName ?? ''}</div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
