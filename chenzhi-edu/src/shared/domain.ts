/**
 * 共享领域契约（client + server 同源）。
 *
 * 辰知教务的核心域：学员 / 教师 / 课程 / 班级 / 排课 / 考勤 / 成绩 / 收费订单。
 * 枚举、DTO、zod 校验规则集中在此，避免前后端各写一份而漂移。
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// 枚举（string union，落库为 text，前后端一致）
// ---------------------------------------------------------------------------

/** 学员状态：在读 / 毕业 / 休学 / 退学 */
export const StudentStatus = ['active', 'graduated', 'suspended', 'dropped'] as const
export type StudentStatus = (typeof StudentStatus)[number]
export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  active: '在读',
  graduated: '毕业',
  suspended: '休学',
  dropped: '退学',
}

/** 教师状态：在职 / 离职 */
export const TeacherStatus = ['active', 'inactive'] as const
export type TeacherStatus = (typeof TeacherStatus)[number]
export const TEACHER_STATUS_LABEL: Record<TeacherStatus, string> = {
  active: '在职',
  inactive: '离职',
}

/** 课程状态：开课 / 停开 */
export const CourseStatus = ['active', 'archived'] as const
export type CourseStatus = (typeof CourseStatus)[number]
export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  active: '开课中',
  archived: '已停开',
}

/** 班级状态：招生中 / 进行中 / 已结课 / 已取消 */
export const ClassStatus = ['recruiting', 'ongoing', 'finished', 'cancelled'] as const
export type ClassStatus = (typeof ClassStatus)[number]
export const CLASS_STATUS_LABEL: Record<ClassStatus, string> = {
  recruiting: '招生中',
  ongoing: '进行中',
  finished: '已结课',
  cancelled: '已取消',
}

/** 考勤状态：出勤 / 迟到 / 请假 / 缺勤 / 补课 */
export const AttendanceStatus = ['present', 'late', 'leave', 'absent', 'makeup'] as const
export type AttendanceStatus = (typeof AttendanceStatus)[number]
export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '出勤',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
  makeup: '补课',
}
/** 计入课时消耗的考勤状态（出勤/迟到/补课 扣课时） */
export const LESSON_CONSUMING: AttendanceStatus[] = ['present', 'late', 'makeup']

/** 订单状态：待支付 / 已支付 / 已退款 / 已取消 */
export const OrderStatus = ['pending', 'paid', 'refunded', 'cancelled'] as const
export type OrderStatus = (typeof OrderStatus)[number]
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待支付',
  paid: '已支付',
  refunded: '已退款',
  cancelled: '已取消',
}

/** 支付方式 */
export const PayMethod = ['cash', 'wechat', 'alipay', 'card', 'transfer'] as const
export type PayMethod = (typeof PayMethod)[number]
export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '银行卡',
  transfer: '对公转账',
}

/** 性别 */
export const Gender = ['male', 'female', 'unknown'] as const
export type Gender = (typeof Gender)[number]
export const GENDER_LABEL: Record<Gender, string> = { male: '男', female: '女', unknown: '未知' }

/** 星期（1=周一 … 7=周日） */
export const WEEKDAY_LABEL: Record<number, string> = {
  1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日',
}

// ---------------------------------------------------------------------------
// RBAC：角色与权限
// ---------------------------------------------------------------------------

/**
 * 角色（落 users.role）。辰知教务典型岗位：
 * admin 超级管理员 / academic 教务 / teacher 教师 / finance 财务 / viewer 只读
 */
export const Role = ['admin', 'academic', 'teacher', 'finance', 'viewer'] as const
export type Role = (typeof Role)[number]
export const ROLE_LABEL: Record<Role, string> = {
  admin: '超级管理员',
  academic: '教务',
  teacher: '教师',
  finance: '财务',
  viewer: '只读',
}

/** 权限点：资源:动作 */
export const Permission = [
  'student:read', 'student:write', 'student:delete',
  'teacher:read', 'teacher:write', 'teacher:delete',
  'course:read', 'course:write', 'course:delete',
  'class:read', 'class:write', 'class:delete',
  'schedule:read', 'schedule:write',
  'attendance:read', 'attendance:write',
  'grade:read', 'grade:write',
  'order:read', 'order:write',
  'dashboard:read',
  'setting:write',
  'file:read', 'file:write',
] as const
export type Permission = (typeof Permission)[number]

/** 角色 → 权限映射（服务端 requireRole / 客户端菜单过滤共用） */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...Permission],
  academic: [
    'student:read', 'student:write',
    'teacher:read',
    'course:read', 'course:write',
    'class:read', 'class:write',
    'schedule:read', 'schedule:write',
    'attendance:read', 'attendance:write',
    'grade:read', 'grade:write',
    'order:read',
    'dashboard:read',
    'file:read', 'file:write',
  ],
  teacher: [
    'student:read',
    'course:read',
    'class:read',
    'schedule:read',
    'attendance:read', 'attendance:write',
    'grade:read', 'grade:write',
    'dashboard:read',
    'file:read',
  ],
  finance: [
    'student:read',
    'course:read',
    'class:read',
    'order:read', 'order:write',
    'dashboard:read',
    'file:read',
  ],
  viewer: [
    'student:read', 'teacher:read', 'course:read', 'class:read',
    'schedule:read', 'attendance:read', 'grade:read', 'order:read',
    'dashboard:read', 'file:read',
  ],
}

export function permissionsOf(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}
export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false
  return permissionsOf(role).includes(perm)
}

// ---------------------------------------------------------------------------
// zod 校验规则（服务端写操作 + 客户端表单共用）
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().min(1, '不能为空').max(max)
const optionalTrimmed = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

export const studentSchema = z.object({
  name: trimmed(50),
  studentNo: trimmed(40),
  phone: optionalTrimmed(20),
  gender: z.enum(Gender).default('unknown'),
  birthDate: optionalTrimmed(10), // YYYY-MM-DD
  gradeLevel: optionalTrimmed(30),
  guardianName: optionalTrimmed(50),
  guardianPhone: optionalTrimmed(20),
  address: optionalTrimmed(200),
  status: z.enum(StudentStatus).default('active'),
  balanceLessons: z.number().int().min(0).default(0),
  remark: optionalTrimmed(500),
})
export type StudentInput = z.infer<typeof studentSchema>

export const teacherSchema = z.object({
  name: trimmed(50),
  teacherNo: trimmed(40),
  phone: optionalTrimmed(20),
  gender: z.enum(Gender).default('unknown'),
  title: optionalTrimmed(50),
  subjects: z.array(z.string().trim()).default([]),
  status: z.enum(TeacherStatus).default('active'),
  remark: optionalTrimmed(500),
})
export type TeacherInput = z.infer<typeof teacherSchema>

export const courseSchema = z.object({
  name: trimmed(80),
  code: trimmed(30),
  subject: optionalTrimmed(40),
  creditHours: z.number().min(0).default(0),
  totalLessons: z.number().int().min(0).default(0),
  pricePerLesson: z.number().min(0).default(0),
  colorIndex: z.number().int().min(1).max(8).default(1),
  description: optionalTrimmed(500),
  status: z.enum(CourseStatus).default('active'),
})
export type CourseInput = z.infer<typeof courseSchema>

export const classSchema = z.object({
  name: trimmed(80),
  courseId: trimmed(36),
  teacherId: optionalTrimmed(36),
  room: optionalTrimmed(60),
  capacity: z.number().int().min(1).default(30),
  startDate: optionalTrimmed(10),
  status: z.enum(ClassStatus).default('recruiting'),
  remark: optionalTrimmed(500),
})
export type ClassInput = z.infer<typeof classSchema>

/** 排课：某班级在「周 X · 第 N 节」的固定时段 */
export const scheduleSchema = z.object({
  classId: trimmed(36),
  weekday: z.number().int().min(1).max(7),
  startPeriod: z.number().int().min(1).max(14),
  endPeriod: z.number().int().min(1).max(14),
  weekStart: z.number().int().min(1).default(1),
  weekEnd: z.number().int().min(1).default(20),
  room: optionalTrimmed(60),
})
export type ScheduleInput = z.infer<typeof scheduleSchema>

export const attendanceSchema = z.object({
  scheduleId: trimmed(36),
  studentId: trimmed(36),
  lessonDate: trimmed(10), // YYYY-MM-DD
  status: z.enum(AttendanceStatus),
  consumedLessons: z.number().int().min(0).max(4).default(1),
  remark: optionalTrimmed(200),
})
export type AttendanceInput = z.infer<typeof attendanceSchema>

export const gradeSchema = z.object({
  studentId: trimmed(36),
  classId: optionalTrimmed(36),
  examName: trimmed(80),
  score: z.number().min(0),
  fullScore: z.number().min(1).default(100),
  examDate: trimmed(10),
  remark: optionalTrimmed(200),
})
export type GradeInput = z.infer<typeof gradeSchema>

export const orderSchema = z.object({
  studentId: trimmed(36),
  courseId: trimmed(36),
  lessonsPurchased: z.number().int().min(1),
  amount: z.number().min(0),
  payMethod: z.enum(PayMethod).default('wechat'),
  status: z.enum(OrderStatus).default('paid'),
  paidAt: optionalTrimmed(10),
  remark: optionalTrimmed(300),
})
export type OrderInput = z.infer<typeof orderSchema>

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(30),
  password: z.string().min(8, '密码至少 8 位').max(72),
  nickname: optionalTrimmed(50),
})
export type RegisterInput = z.infer<typeof registerSchema>

// ---------------------------------------------------------------------------
// DTO（服务端 → 客户端的读模型）
// ---------------------------------------------------------------------------

export interface StudentDto {
  id: string
  name: string
  studentNo: string
  phone: string | null
  gender: Gender
  birthDate: string | null
  gradeLevel: string | null
  guardianName: string | null
  guardianPhone: string | null
  address: string | null
  status: StudentStatus
  balanceLessons: number
  remark: string | null
  avatarUrl: string | null
  createdAt: number
  classCount: number
}

export interface TeacherDto {
  id: string
  name: string
  teacherNo: string
  phone: string | null
  gender: Gender
  title: string | null
  subjects: string[]
  status: TeacherStatus
  remark: string | null
  avatarUrl: string | null
  createdAt: number
  classCount: number
}

export interface CourseDto {
  id: string
  name: string
  code: string
  subject: string | null
  creditHours: number
  totalLessons: number
  pricePerLesson: number
  colorIndex: number
  description: string | null
  status: CourseStatus
  classCount: number
  studentCount: number
}

export interface ClassDto {
  id: string
  name: string
  courseId: string
  courseName: string
  courseColor: number
  teacherId: string | null
  teacherName: string | null
  room: string | null
  capacity: number
  enrolled: number
  startDate: string | null
  status: ClassStatus
  remark: string | null
  schedules: ScheduleDto[]
}

export interface ScheduleDto {
  id: string
  classId: string
  className: string
  courseName: string
  courseColor: number
  teacherName: string | null
  weekday: number
  startPeriod: number
  endPeriod: number
  weekStart: number
  weekEnd: number
  room: string | null
}

export interface AttendanceDto {
  id: string
  scheduleId: string
  studentId: string
  studentName: string
  lessonDate: string
  className: string
  status: AttendanceStatus
  consumedLessons: number
  remark: string | null
  createdAt: number
}

export interface GradeDto {
  id: string
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  examName: string
  score: number
  fullScore: number
  examDate: string
  remark: string | null
}

export interface OrderDto {
  id: string
  orderNo: string
  studentId: string
  studentName: string
  courseId: string
  courseName: string
  lessonsPurchased: number
  amount: number
  payMethod: PayMethod
  status: OrderStatus
  paidAt: string | null
  remark: string | null
  createdAt: number
}

export interface SessionUser {
  id: string
  username: string | null
  nickname: string | null
  avatarUrl: string | null
  role: Role
  permissions: Permission[]
}

/** 仪表盘聚合统计 */
export interface DashboardStats {
  students: number
  activeStudents: number
  teachers: number
  courses: number
  classes: number
  ongoingClasses: number
  todayLessons: number
  monthRevenue: number
  monthOrders: number
  attendanceRate: number
  lowBalanceStudents: number
  revenueByMonth: { month: string; revenue: number }[]
  studentsByStatus: { status: string; label: string; count: number }[]
  topCourses: { name: string; students: number; revenue: number }[]
  recentOrders: OrderDto[]
}

/** 授权状态（前端横幅展示用，对齐 @homurajs/license 契约） */
export interface LicenseStateDto {
  status: string
  enforcement: string
  notice: string | null
  features: string[]
  expiresAt: string | null
  signature: string
}

/** 统一分页响应 */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 课时节次定义（第 1~14 节的典型作息，可被排课引用） */
export interface PeriodDef {
  index: number
  label: string
  start: string // HH:mm
  end: string
}

export const PERIODS: PeriodDef[] = [
  { index: 1, label: '第1节', start: '08:00', end: '08:45' },
  { index: 2, label: '第2节', start: '08:55', end: '09:40' },
  { index: 3, label: '第3节', start: '10:00', end: '10:45' },
  { index: 4, label: '第4节', start: '10:55', end: '11:40' },
  { index: 5, label: '第5节', start: '14:00', end: '14:45' },
  { index: 6, label: '第6节', start: '14:55', end: '15:40' },
  { index: 7, label: '第7节', start: '16:00', end: '16:45' },
  { index: 8, label: '第8节', start: '16:55', end: '17:40' },
  { index: 9, label: '第9节', start: '19:00', end: '19:45' },
  { index: 10, label: '第10节', start: '19:55', end: '20:40' },
  { index: 11, label: '第11节', start: '20:50', end: '21:35' },
  { index: 12, label: '第12节', start: '21:45', end: '22:30' },
]

export function periodRange(start: number, end: number): string {
  const s = PERIODS.find((p) => p.index === start)
  const e = PERIODS.find((p) => p.index === end)
  if (!s || !e) return `${start}-${end}节`
  return `${s.start}-${e.end}`
}

/** 通用 API 错误体 */
export interface ApiError {
  error: string
  message?: string
  [k: string]: unknown
}
