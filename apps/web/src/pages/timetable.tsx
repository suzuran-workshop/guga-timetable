import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarOff } from 'lucide-react'
import { qs } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useClassOptions, useTeacherOptions } from '../hooks/use-options.js'
import { useTermContext } from '../hooks/use-term.js'
import { PageHeader } from '../components/page-header.js'
import { TimetableGrid } from '../components/timetable-grid.js'
import { FormDialog, type FieldSpec } from '../components/form-dialog.js'
import { Button } from '../components/ui/button.js'
import { Card } from '../components/ui/card.js'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import { scheduleSchema, PERIODS, WEEKDAY_LABEL, type ScheduleDto } from '@guga/shared'

type Dim = 'global' | 'teacher' | 'class'

/**
 * 课表（周视图网格）：支持三维度切换——全局 / 教师 / 班级。
 * 教学周由当前学期解析（/api/terms/context），不再硬编码起点。
 * 三个维度复用 TimetableGrid，只是喂入的 schedules 过滤条件不同。
 */
export function TimetablePage() {
  const can = useAppStore((s) => s.can)
  const { options: classOptions } = useClassOptions()
  const { options: teacherOptions } = useTeacherOptions()
  const { term, currentWeek, totalWeeks, hasTerm } = useTermContext()

  const [dim, setDim] = useState<Dim>('global')
  const [teacherId, setTeacherId] = useState<string>('')
  const [classId, setClassId] = useState<string>('')
  const [week, setWeek] = useState<number | null>(null)
  const effectiveWeek = week ?? currentWeek
  const [dialogOpen, setDialogOpen] = useState(false)

  // 维度对应的过滤参数
  const filter = dim === 'teacher' ? { teacherId: teacherId || undefined }
    : dim === 'class' ? { classId: classId || undefined }
    : {}
  const ready = dim === 'global' || (dim === 'teacher' && teacherId) || (dim === 'class' && classId)

  const { data, loading, reload } = useApi<{ items: ScheduleDto[] }>(
    ready ? `/api/schedules${qs({ week: effectiveWeek, ...filter })}` : null,
    { deps: [effectiveWeek, dim, teacherId, classId, ready] },
  )
  const schedules = data?.items ?? []

  const fields: FieldSpec[] = [
    { name: 'classId', label: '班级', type: 'select', required: true, options: classOptions },
    { name: 'weekday', label: '星期', type: 'select', required: true, options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: WEEKDAY_LABEL[d] })) },
    { name: 'startPeriod', label: '开始节次', type: 'select', required: true, options: PERIODS.map((p) => ({ value: String(p.index), label: `${p.label} ${p.start}` })) },
    { name: 'endPeriod', label: '结束节次', type: 'select', required: true, options: PERIODS.map((p) => ({ value: String(p.index), label: `${p.label} ${p.end}` })) },
    { name: 'weekStart', label: '起始周', type: 'number', min: 1, max: totalWeeks },
    { name: 'weekEnd', label: '结束周', type: 'number', min: 1, max: totalWeeks },
    { name: 'room', label: '教室', type: 'text', colSpan: 2, placeholder: '如 A101' },
  ]

  return (
    <div>
      <PageHeader title="课表" description={term ? `${term.name} · 共 ${totalWeeks} 周` : '周课表 · 未设置当前学期'}>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setWeek(Math.max(1, effectiveWeek - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[80px] px-2 text-center text-sm font-medium tabular-nums">
              第 {effectiveWeek} 周{week === null && <span className="text-muted-foreground">（本周）</span>}
            </span>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setWeek(Math.min(totalWeeks, effectiveWeek + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {week !== null && <Button variant="outline" size="sm" onClick={() => setWeek(null)}>回到本周</Button>}
          {can('schedule:write') && <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />排课</Button>}
        </div>
      </PageHeader>

      {/* 维度切换 + 实体选择 */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs value={dim} onValueChange={(v) => setDim(v as Dim)}>
          <TabsList>
            <TabsTrigger value="global">全校</TabsTrigger>
            <TabsTrigger value="teacher">教师</TabsTrigger>
            <TabsTrigger value="class">班级</TabsTrigger>
          </TabsList>
        </Tabs>
        {dim === 'teacher' && (
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="选择教师" /></SelectTrigger>
            <SelectContent>{teacherOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {dim === 'class' && (
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="选择班级" /></SelectTrigger>
            <SelectContent>{classOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {!hasTerm && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          尚未设置当前学期，教学周以第 1 周起算。请在「系统设置 → 学期管理」中创建并设为当前学期。
        </div>
      )}

      <Card className="overflow-hidden" data-testid="timetable-grid">
        {!ready ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarOff className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">请选择{dim === 'teacher' ? '教师' : '班级'}查看课表</p>
          </div>
        ) : (
          <TimetableGrid schedules={schedules} />
        )}
      </Card>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        {ready && <span>第 {effectiveWeek} 周共 {schedules.length} 节排课</span>}
        {loading && <span>· 加载中…</span>}
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="新增排课"
        description="系统会自动检测教室/教师冲突"
        fields={fields}
        schema={scheduleSchema as any}
        defaultValues={{ weekday: '1', startPeriod: '1', endPeriod: '2', weekStart: 1, weekEnd: totalWeeks, classId: classOptions[0]?.value }}
        endpoint="/api/schedules"
        editId={null}
        onSaved={() => { setDialogOpen(false); reload() }}
        transform={(v) => ({
          ...v,
          weekday: Number(v.weekday), startPeriod: Number(v.startPeriod), endPeriod: Number(v.endPeriod),
          weekStart: Number(v.weekStart) || 1, weekEnd: Number(v.weekEnd) || totalWeeks,
        })}
      />
    </div>
  )
}
