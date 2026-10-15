import { useEffect, useState } from 'react'
import { ClipboardCheck, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, qs, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { useClassOptions } from '../hooks/use-options.js'
import { PageHeader } from '../components/page-header.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import { Skeleton } from '../components/ui/skeleton.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select.js'
import {
  ATTENDANCE_STATUS_LABEL, AttendanceStatus, LESSON_CONSUMING,
  periodRange, type ScheduleDto,
} from '@guga/shared'
import { cn, today } from '../lib/utils.js'

interface RosterItem {
  studentId: string
  studentName: string
  studentNo: string
  balanceLessons: number
  currentStatus: AttendanceStatus | null
  currentId: string | null
}
interface RosterResp {
  schedule: ScheduleDto
  lessonDate: string
  roster: RosterItem[]
}

const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500 text-white border-emerald-500',
  late: 'bg-amber-500 text-white border-amber-500',
  leave: 'bg-sky-500 text-white border-sky-500',
  absent: 'bg-rose-500 text-white border-rose-500',
  makeup: 'bg-violet-500 text-white border-violet-500',
}

/**
 * 考勤点名：选班级 → 选排课节次 → 选日期 → 逐个标记考勤状态 → 保存。
 * 出勤/迟到/补课 会计入课时消耗，后端联动扣减学员余额。
 */
export function AttendancePage() {
  const can = useAppStore((s) => s.can)
  const { classes } = useClassOptions()
  const [classId, setClassId] = useState<string>('')
  const [scheduleId, setScheduleId] = useState<string>('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)

  // 班级排课列表（用于选节次）
  const { data: classScheds } = useApi<{ items: ScheduleDto[] }>(
    classId ? `/api/classes/${classId}/schedules` : null,
    { deps: [classId] },
  )

  // 点名册
  const { data: roster, loading, reload } = useApi<RosterResp>(
    scheduleId && date ? `/api/attendance/roster${qs({ scheduleId, date })}` : null,
    { deps: [scheduleId, date] },
  )

  // 本地标记态（studentId → status）
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  useEffect(() => {
    if (roster) {
      const init: Record<string, AttendanceStatus> = {}
      for (const r of roster.roster) if (r.currentStatus) init[r.studentId] = r.currentStatus
      setMarks(init)
    }
  }, [roster])

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id)
  }, [classes, classId])

  useEffect(() => {
    if (classScheds?.items.length && !scheduleId) setScheduleId(classScheds.items[0].id)
  }, [classScheds, scheduleId])

  const setStatus = (sid: string, status: AttendanceStatus) => {
    setMarks((m) => {
      const next = { ...m }
      if (next[sid] === status) delete next[sid]
      else next[sid] = status
      return next
    })
  }

  const setAll = (status: AttendanceStatus) => {
    if (!roster) return
    const all: Record<string, AttendanceStatus> = {}
    for (const r of roster.roster) all[r.studentId] = status
    setMarks(all)
  }

  const handleSave = async () => {
    if (!roster || !scheduleId) return
    const entries = Object.entries(marks)
    if (!entries.length) return toast.error('请至少标记一名学员')
    setSaving(true)
    try {
      await api.post('/api/attendance/mark', {
        scheduleId,
        lessonDate: date,
        marks: entries.map(([studentId, status]) => ({ studentId, status })),
      })
      toast.success(`已保存 ${entries.length} 条考勤`)
      reload()
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(false)
    }
  }

  const markedCount = Object.keys(marks).length
  const consumingCount = Object.values(marks).filter((s) => LESSON_CONSUMING.includes(s)).length

  return (
    <div>
      <PageHeader title="考勤点名" description="登记出勤并联动扣减课时余额">
        {can('attendance:write') && (
          <Button onClick={handleSave} disabled={!markedCount || saving || !roster}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存点名（{markedCount}）
          </Button>
        )}
      </PageHeader>

      {/* 选择器 */}
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="att-class" className="text-xs font-medium text-muted-foreground">班级</label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setScheduleId('') }}>
              <SelectTrigger id="att-class"><SelectValue placeholder="选择班级" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="att-schedule" className="text-xs font-medium text-muted-foreground">排课节次</label>
            <Select value={scheduleId} onValueChange={setScheduleId} disabled={!classScheds?.items.length}>
              <SelectTrigger id="att-schedule"><SelectValue placeholder="选择节次" /></SelectTrigger>
              <SelectContent>
                {(classScheds?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][s.weekday]} · {periodRange(s.startPeriod, s.endPeriod)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="att-date" className="text-xs font-medium text-muted-foreground">上课日期</label>
            <Input id="att-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!scheduleId ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">请选择班级与排课节次开始点名</CardContent></Card>
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !roster || !roster.roster.length ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">该班级暂无学员</CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {roster.schedule.courseName} · {roster.schedule.className}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{roster.lessonDate}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                已标记 {markedCount}/{roster.roster.length} · 扣课时 {consumingCount}
              </span>
              {can('attendance:write') && (
                <Button variant="outline" size="sm" onClick={() => setAll('present')}>全部出勤</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {roster.roster.map((r) => (
              <div key={r.studentId} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                    {r.studentName.slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-medium">{r.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.studentNo} · 余额
                      <span className={cn('ml-1 tabular-nums', r.balanceLessons <= 3 ? 'font-semibold text-rose-600' : '')}>
                        {r.balanceLessons}
                      </span> 课时
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AttendanceStatus.map((s) => {
                    const active = marks[r.studentId] === s
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!can('attendance:write')}
                        onClick={() => setStatus(r.studentId, s)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                          active ? STATUS_TONE[s] : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {ATTENDANCE_STATUS_LABEL[s]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 状态图例 */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <ClipboardCheck className="h-4 w-4" />
        {AttendanceStatus.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-sm', STATUS_TONE[s].split(' ')[0])} />
            {ATTENDANCE_STATUS_LABEL[s]}{LESSON_CONSUMING.includes(s) && '（扣课时）'}
          </span>
        ))}
      </div>
    </div>
  )
}
