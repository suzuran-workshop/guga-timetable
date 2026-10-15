import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, User, Phone, GraduationCap, Wallet, CalendarDays,
  Award, Pencil,
} from 'lucide-react'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { StudentDialog } from '../components/dialogs/student-dialog.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Badge } from '../components/ui/badge.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { Separator } from '../components/ui/separator.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js'
import { DataTable, type Column } from '../components/data-table.js'
import { formatMoney, formatDate } from '../lib/utils.js'
import {
  STUDENT_STATUS_LABEL, GENDER_LABEL, ATTENDANCE_STATUS_LABEL,
  ORDER_STATUS_LABEL, type StudentDto, type ClassDto, type AttendanceDto,
  type GradeDto, type OrderDto,
} from '@guga/shared'

interface ProfileResp {
  student: StudentDto
  classes: ClassDto[]
  attendance: AttendanceDto[]
  grades: GradeDto[]
  orders: OrderDto[]
  avgScore: number
}

/** 学员个人档案：基本信息 + 班级 + 考勤 + 成绩 + 订单 五合一视图。 */
export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const can = useAppStore((s) => s.can)
  const { data, loading, reload } = useApi<ProfileResp>(id ? `/api/students/${id}/profile` : null, { deps: [id] })
  const [editOpen, setEditOpen] = useState(false)

  if (loading || !data) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
  }

  const { student, classes, attendance, grades, orders, avgScore } = data
  const totalPurchased = orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.lessonsPurchased, 0)
  const totalConsumed = attendance.reduce((s, a) => s + a.consumedLessons, 0)

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => navigate('/students')}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />返回学员列表
      </Button>

      <PageHeader title={student.name} description={`学号 ${student.studentNo}`}>
        {can('student:write') && (
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />编辑资料</Button>
        )}
      </PageHeader>

      {/* 概览卡 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary"><GraduationCap className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">年级</p><p className="text-lg font-semibold">{student.gradeLevel || '—'}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600"><Wallet className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">剩余课时</p><p className="text-lg font-semibold tabular-nums">{student.balanceLessons}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600"><Award className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">平均分</p><p className="text-lg font-semibold tabular-nums">{avgScore || '—'}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600"><CalendarDays className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">在读班级</p><p className="text-lg font-semibold tabular-nums">{classes.length}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左：基本信息 */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow icon={<User className="h-4 w-4" />} label="姓名" value={student.name} />
            <InfoRow icon={<User className="h-4 w-4" />} label="性别" value={GENDER_LABEL[student.gender]} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="联系电话" value={student.phone || '—'} />
            <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="出生日期" value={student.birthDate ? formatDate(student.birthDate) : '—'} />
            <Separator />
            <InfoRow icon={<User className="h-4 w-4" />} label="监护人" value={student.guardianName || '—'} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="监护人电话" value={student.guardianPhone || '—'} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">状态</span>
              <Badge variant={student.status === 'active' ? 'default' : 'secondary'}>{STUDENT_STATUS_LABEL[student.status]}</Badge>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">备注</span>
              <span className="text-right text-muted-foreground">{student.remark || '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>累计购课 {totalPurchased} 课时</span>
              <span>累计消耗 {totalConsumed} 课时</span>
            </div>
          </CardContent>
        </Card>

        {/* 右：Tabs */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <Tabs defaultValue="classes">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="classes">班级 ({classes.length})</TabsTrigger>
                <TabsTrigger value="attendance">考勤 ({attendance.length})</TabsTrigger>
                <TabsTrigger value="grades">成绩 ({grades.length})</TabsTrigger>
                <TabsTrigger value="orders">订单 ({orders.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="classes" className="mt-4">
                <DataTable
                  rowKey={(c) => c.id}
                  rows={classes}
                  empty="暂未加入班级"
                  columns={[
                    { key: 'name', header: '班级', cell: (c) => <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.courseName}</div></div> },
                    { key: 'teacher', header: '教师', cell: (c) => <span className="text-sm">{c.teacherName || '—'}</span> },
                    { key: 'room', header: '教室', cell: (c) => <span className="text-sm">{c.room || '—'}</span> },
                    { key: 'sched', header: '排课', cell: (c) => <Badge variant="secondary">{c.schedules.length} 节</Badge> },
                  ] as Column<ClassDto>[]}
                />
              </TabsContent>

              <TabsContent value="attendance" className="mt-4">
                <DataTable
                  rowKey={(a) => a.id}
                  rows={attendance}
                  empty="暂无考勤记录"
                  columns={[
                    { key: 'date', header: '日期', cell: (a) => <span className="text-sm tabular-nums">{a.lessonDate}</span> },
                    { key: 'class', header: '班级', cell: (a) => <span className="text-sm">{a.className}</span> },
                    { key: 'status', header: '状态', cell: (a) => <Badge variant={a.status === 'absent' ? 'destructive' : a.status === 'present' ? 'default' : 'secondary'}>{ATTENDANCE_STATUS_LABEL[a.status]}</Badge> },
                    { key: 'consume', header: '扣课时', cell: (a) => <span className="text-sm tabular-nums">{a.consumedLessons}</span> },
                  ] as Column<AttendanceDto>[]}
                />
              </TabsContent>

              <TabsContent value="grades" className="mt-4">
                <DataTable
                  rowKey={(g) => g.id}
                  rows={grades}
                  empty="暂无成绩记录"
                  columns={[
                    { key: 'exam', header: '考试', cell: (g) => <span className="text-sm font-medium">{g.examName}</span> },
                    { key: 'class', header: '班级', cell: (g) => <span className="text-sm">{g.className || '—'}</span> },
                    { key: 'score', header: '成绩', cell: (g) => <span className="text-sm font-semibold tabular-nums">{g.score}/{g.fullScore}</span> },
                    { key: 'date', header: '日期', cell: (g) => <span className="text-sm tabular-nums">{g.examDate}</span> },
                  ] as Column<GradeDto>[]}
                />
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                <DataTable
                  rowKey={(o) => o.id}
                  rows={orders}
                  empty="暂无订单记录"
                  columns={[
                    { key: 'no', header: '订单号', cell: (o) => <span className="font-mono text-xs">{o.orderNo}</span> },
                    { key: 'course', header: '课程', cell: (o) => <span className="text-sm">{o.courseName}</span> },
                    { key: 'amount', header: '金额', cell: (o) => <span className="text-sm font-medium tabular-nums">{formatMoney(o.amount)}</span> },
                    { key: 'status', header: '状态', cell: (o) => <Badge variant={o.status === 'paid' ? 'default' : 'secondary'}>{ORDER_STATUS_LABEL[o.status]}</Badge> },
                  ] as Column<OrderDto>[]}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <StudentDialog open={editOpen} onOpenChange={setEditOpen} student={student} onSaved={() => { setEditOpen(false); reload() }} />
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
