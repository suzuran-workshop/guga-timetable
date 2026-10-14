import { eq } from 'drizzle-orm'
import { createDatabase, migrate } from '../src/server/db/index.js'
import { initTables, tables } from '../src/server/db/tables.js'
import { Services } from '../src/server/repo/index.js'
import { ProfileRepo } from '../src/server/repo/profile.js'
import { createAuth } from '../src/server/auth/index.js'
import { createNodeAdapter } from '@homurajs/app-kit/serve'
import { loadConfig } from '../src/server/env.js'
import { createLogger } from '@homurajs/core'

/**
 * 种子脚本（npm run db:seed）：
 * - 建管理员账号（auth PasswordProvider 注册 → profile 提升为 admin）
 * - 灌入演示数据：课程/教师/班级/学员/排课/订单/考勤/成绩
 * 幂等：管理员已存在则跳过创建，仅补 profile。
 */
const logger = createLogger().child('seed')
const cfg = loadConfig()

const bundle = createDatabase({ dbPath: cfg.get('dbPath'), databaseUrl: cfg.get('databaseUrl'), logger })
await migrate(bundle)
initTables(bundle)

const svc = new Services(bundle)
const profiles = new ProfileRepo(bundle)
const auth = createAuth({
  bundle,
  secret: cfg.get('authSecret'),
  accessTtlSec: cfg.get('accessTokenTtlSec'),
  refreshTtlSec: cfg.get('refreshTokenTtlSec'),
  allowRegister: true,
  adapter: createNodeAdapter(),
})

const t = tables()
const db = bundle.db as any

// ---- 1. 管理员账号 ----
const adminUsername = cfg.get('seedAdminUsername')
const adminPassword = cfg.get('seedAdminPassword')
const adminNickname = cfg.get('seedAdminNickname')

const existing = await db.select().from(t.authUsers).where(eq(t.authUsers.username, adminUsername)).limit(1)
let adminId: string
if (existing[0]) {
  adminId = existing[0].id
  logger.info('管理员已存在，跳过创建', { adminId })
} else {
  const user = await auth.password.register({ username: adminUsername, password: adminPassword, nickname: adminNickname })
  adminId = user.id
  logger.info('管理员已创建', { adminId, username: adminUsername })
}
await profiles.upsertProfile(adminId, { role: 'admin', realName: adminNickname })

// ---- 2. 演示数据（仅当业务表为空时灌入，避免重复）----
const existingCourses = await db.select().from(t.courses).limit(1)
if (existingCourses[0]) {
  logger.info('演示数据已存在，跳过灌入')
  logger.info('✅ 种子完成', { adminUsername, adminPassword })
  process.exit(0)
}

logger.info('灌入演示数据…')

// 课程
const courses = [
  { name: '高一数学·同步', code: 'MATH-101', subject: '数学', creditHours: 4, totalLessons: 40, pricePerLesson: 200, colorIndex: 1 },
  { name: '高一英语·同步', code: 'ENG-101', subject: '英语', creditHours: 4, totalLessons: 40, pricePerLesson: 180, colorIndex: 2 },
  { name: '高二物理·提高', code: 'PHY-201', subject: '物理', creditHours: 3, totalLessons: 30, pricePerLesson: 260, colorIndex: 4 },
  { name: '初三化学·冲刺', code: 'CHEM-301', subject: '化学', creditHours: 3, totalLessons: 24, pricePerLesson: 220, colorIndex: 6 },
]
const courseIds: string[] = []
for (const c of courses) {
  const created = await svc.course.create(c as any)
  courseIds.push(created.id)
}

// 教师
const teachers = [
  { name: '王明', teacherNo: 'T001', gender: 'male', title: '高级教师', subjects: ['数学'] },
  { name: '李娜', teacherNo: 'T002', gender: 'female', title: '一级教师', subjects: ['英语'] },
  { name: '张伟', teacherNo: 'T003', gender: 'male', title: '特级教师', subjects: ['物理'] },
  { name: '刘芳', teacherNo: 'T004', gender: 'female', title: '一级教师', subjects: ['化学'] },
]
const teacherIds: string[] = []
for (const tr of teachers) {
  const created = await svc.teacher.create(tr as any)
  teacherIds.push(created.id)
}

// 班级
const classes = [
  { name: '数学冲刺1班', courseId: courseIds[0], teacherId: teacherIds[0], room: 'A101', capacity: 30, status: 'ongoing' },
  { name: '英语提高2班', courseId: courseIds[1], teacherId: teacherIds[1], room: 'A102', capacity: 30, status: 'ongoing' },
  { name: '物理竞赛班', courseId: courseIds[2], teacherId: teacherIds[2], room: 'B201', capacity: 20, status: 'recruiting' },
  { name: '化学基础班', courseId: courseIds[3], teacherId: teacherIds[3], room: 'B202', capacity: 25, status: 'ongoing' },
]
const classIds: string[] = []
for (const cl of classes) {
  const created = await svc.klass.create(cl as any)
  classIds.push(created.id)
}

// 排课（周一~周五，错开教室/教师避免冲突）
const schedules = [
  { classId: classIds[0], weekday: 1, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 16, room: 'A101' },
  { classId: classIds[1], weekday: 1, startPeriod: 3, endPeriod: 4, weekStart: 1, weekEnd: 16, room: 'A102' },
  { classId: classIds[2], weekday: 2, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 16, room: 'B201' },
  { classId: classIds[3], weekday: 2, startPeriod: 5, endPeriod: 6, weekStart: 1, weekEnd: 16, room: 'B202' },
  { classId: classIds[0], weekday: 3, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 16, room: 'A101' },
  { classId: classIds[1], weekday: 4, startPeriod: 3, endPeriod: 4, weekStart: 1, weekEnd: 16, room: 'A102' },
  { classId: classIds[3], weekday: 5, startPeriod: 5, endPeriod: 6, weekStart: 1, weekEnd: 16, room: 'B202' },
]
const scheduleIds: string[] = []
for (const s of schedules) {
  const cls = await svc.klass.getById(s.classId)
  const r = await svc.schedule.create({ ...s, teacherId: cls?.teacherId } as any)
  if (r.ok && r.schedule) scheduleIds.push(r.schedule.id)
  else logger.warn('排课冲突，跳过', { classId: s.classId, conflicts: r.conflicts })
}

// 学员（10 名）+ 入班 + 订单充值
const studentNames = ['陈晨', '林悦', '黄磊', '周雨', '吴迪', '徐峰', '孙倩', '马超', '朱琳', '胡军']
const studentIds: string[] = []
for (let i = 0; i < studentNames.length; i++) {
  const s = await svc.student.create({
    name: studentNames[i],
    studentNo: `S${String(1001 + i)}`,
    phone: `1380000${String(1000 + i).slice(-4)}`,
    gender: i % 2 === 0 ? 'male' : 'female',
    gradeLevel: i < 5 ? '高一' : '高二',
    balanceLessons: 0,
    status: 'active',
  } as any)
  studentIds.push(s.id)
  // 入班（轮流分配到 4 个班）
  await svc.klass.addMember(classIds[i % 4], s.id)
  // 订单充值（已支付）
  await svc.order.create({
    studentId: s.id,
    courseId: courseIds[i % 4],
    lessonsPurchased: 20 + (i % 3) * 10,
    amount: (20 + (i % 3) * 10) * 200,
    payMethod: (['wechat', 'alipay', 'card'] as const)[i % 3],
    status: 'paid',
  } as any, adminId)
}

// 考勤（对第一个排课，今天的班级成员点名）+ 成绩
if (scheduleIds[0]) {
  const today = new Date().toISOString().slice(0, 10)
  const members = await svc.klass.listMembers(classIds[0])
  await svc.attendance.markBatch(scheduleIds[0], today, members.slice(0, 5).map((m: any, idx: number) => ({
    studentId: m.id,
    status: (['present', 'present', 'late', 'present', 'absent'] as const)[idx] ?? 'present',
  })), adminId)
}
for (let i = 0; i < 5; i++) {
  await svc.grade.create({
    studentId: studentIds[i],
    classId: classIds[i % 4],
    examName: '第一次月考',
    score: 70 + i * 6,
    fullScore: 100,
    examDate: '2026-10-01',
  } as any)
}

const stats = await svc.dashboard.stats()
logger.info('✅ 种子完成', {
  adminUsername, adminPassword,
  courses: courseIds.length, teachers: teacherIds.length, classes: classIds.length,
  schedules: scheduleIds.length, students: studentIds.length,
  monthRevenue: stats.monthRevenue,
})
process.exit(0)
