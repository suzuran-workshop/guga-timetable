import { sqliteCol, sqliteJson, sqliteTable } from '@homurajs/db/schema-helpers'
import { sqliteAuthTables } from '@homurajs/auth/tables'
import { sqliteLicenseTables } from '@homurajs/license/tables'
import { index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * 业务表（SQLite 方言）——与 ./pg.ts 字段同构（assertSchemaParity 校验）。
 * 列名与 pg 侧逐一对齐（drizzle 默认 = JS 属性名 camelCase）。
 * 时间列 epochMs（sqlite integer int64），默认值用 unixepoch()*1000。
 */

const nowMs = sql`(unixepoch() * 1000)`

export const students = sqliteTable('students', {
  id: sqliteCol.id(),
  name: sqliteCol.text().notNull(),
  studentNo: sqliteCol.text().notNull(),
  phone: sqliteCol.text(),
  gender: sqliteCol.text().notNull().default('unknown'),
  birthDate: sqliteCol.text(),
  gradeLevel: sqliteCol.text(),
  guardianName: sqliteCol.text(),
  guardianPhone: sqliteCol.text(),
  address: sqliteCol.text(),
  status: sqliteCol.text().notNull().default('active'),
  balanceLessons: sqliteCol.int().notNull().default(0),
  remark: sqliteCol.text(),
  avatarUrl: sqliteCol.text(),
  createdBy: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('students_no_idx').on(t.studentNo),
  index('students_status_idx').on(t.status),
])

export const teachers = sqliteTable('teachers', {
  id: sqliteCol.id(),
  name: sqliteCol.text().notNull(),
  teacherNo: sqliteCol.text().notNull(),
  phone: sqliteCol.text(),
  gender: sqliteCol.text().notNull().default('unknown'),
  title: sqliteCol.text(),
  subjects: sqliteJson<string[]>(),
  status: sqliteCol.text().notNull().default('active'),
  remark: sqliteCol.text(),
  avatarUrl: sqliteCol.text(),
  userId: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('teachers_no_idx').on(t.teacherNo),
])

export const courses = sqliteTable('courses', {
  id: sqliteCol.id(),
  name: sqliteCol.text().notNull(),
  code: sqliteCol.text().notNull(),
  subject: sqliteCol.text(),
  creditHours: sqliteCol.int().notNull().default(0),
  totalLessons: sqliteCol.int().notNull().default(0),
  pricePerLesson: sqliteCol.int().notNull().default(0),
  colorIndex: sqliteCol.int().notNull().default(1),
  description: sqliteCol.text(),
  status: sqliteCol.text().notNull().default('active'),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('courses_code_idx').on(t.code),
])

export const classes = sqliteTable('classes', {
  id: sqliteCol.id(),
  name: sqliteCol.text().notNull(),
  courseId: sqliteCol.text().notNull(),
  teacherId: sqliteCol.text(),
  room: sqliteCol.text(),
  capacity: sqliteCol.int().notNull().default(30),
  startDate: sqliteCol.text(),
  status: sqliteCol.text().notNull().default('recruiting'),
  remark: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('classes_course_idx').on(t.courseId),
])

export const classMembers = sqliteTable('class_members', {
  id: sqliteCol.id(),
  classId: sqliteCol.text().notNull(),
  studentId: sqliteCol.text().notNull(),
  joinedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('class_members_uniq').on(t.classId, t.studentId),
])

export const schedules = sqliteTable('schedules', {
  id: sqliteCol.id(),
  classId: sqliteCol.text().notNull(),
  weekday: sqliteCol.int().notNull(),
  startPeriod: sqliteCol.int().notNull(),
  endPeriod: sqliteCol.int().notNull(),
  weekStart: sqliteCol.int().notNull().default(1),
  weekEnd: sqliteCol.int().notNull().default(20),
  room: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('schedules_class_idx').on(t.classId),
  index('schedules_day_idx').on(t.weekday),
])

export const attendance = sqliteTable('attendance', {
  id: sqliteCol.id(),
  scheduleId: sqliteCol.text().notNull(),
  studentId: sqliteCol.text().notNull(),
  lessonDate: sqliteCol.text().notNull(),
  status: sqliteCol.text().notNull().default('present'),
  consumedLessons: sqliteCol.int().notNull().default(1),
  remark: sqliteCol.text(),
  markedBy: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('attendance_uniq').on(t.scheduleId, t.studentId, t.lessonDate),
  index('attendance_date_idx').on(t.lessonDate),
])

export const grades = sqliteTable('grades', {
  id: sqliteCol.id(),
  studentId: sqliteCol.text().notNull(),
  classId: sqliteCol.text(),
  examName: sqliteCol.text().notNull(),
  score: sqliteCol.int().notNull().default(0),
  fullScore: sqliteCol.int().notNull().default(100),
  examDate: sqliteCol.text().notNull(),
  remark: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('grades_student_idx').on(t.studentId),
])

export const orders = sqliteTable('orders', {
  id: sqliteCol.id(),
  orderNo: sqliteCol.text().notNull(),
  studentId: sqliteCol.text().notNull(),
  courseId: sqliteCol.text().notNull(),
  lessonsPurchased: sqliteCol.int().notNull(),
  amount: sqliteCol.int().notNull(),
  payMethod: sqliteCol.text().notNull().default('wechat'),
  status: sqliteCol.text().notNull().default('pending'),
  paidAt: sqliteCol.text(),
  remark: sqliteCol.text(),
  createdBy: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('orders_no_idx').on(t.orderNo),
  index('orders_student_idx').on(t.studentId),
])

export const files = sqliteTable('files', {
  id: sqliteCol.id(),
  objectKey: sqliteCol.text().notNull(),
  fileName: sqliteCol.text().notNull(),
  contentType: sqliteCol.text(),
  size: sqliteCol.int().notNull().default(0),
  ns: sqliteCol.text().notNull(),
  uploadedBy: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
})

/**
 * 用户档案扩展：auth 的 users 表由库拥有（无 role 列），
 * 本表以 userId 为外键补充教务系统的 RBAC 角色与展示信息。
 */
export const profiles = sqliteTable('profiles', {
  userId: sqliteCol.text('user_id').primaryKey(),
  role: sqliteCol.text().notNull().default('viewer'),
  realName: sqliteCol.text(),
  phone: sqliteCol.text(),
  teacherId: sqliteCol.text(),
  createdAt: sqliteCol.epochMs().notNull().default(nowMs),
  updatedAt: sqliteCol.epochMs().notNull().default(nowMs),
})

/** 业务 schema 汇总 */
export const sqliteSchema = {
  students, teachers, courses, classes, classMembers, schedules,
  attendance, grades, orders, files, profiles,
}

/**
 * auth/license 内置表逐个再导出——drizzle-kit 只识别模块顶层的 table 导出，
 * 仅 spread 进 fullSqliteSchema 不会被扫描到。
 * license_state 由 createDrizzleStateStore 自建（CREATE IF NOT EXISTS），此处一并纳入迁移以保持完整。
 */
export const authUsers = sqliteAuthTables.users
export const authPasswords = sqliteAuthTables.passwords
export const authRefreshTokens = sqliteAuthTables.refreshTokens
export const authOauth2IdentityLinks = sqliteAuthTables.oauth2IdentityLinks
export const authWebauthnCredentials = sqliteAuthTables.webauthnCredentials
export const licenseState = sqliteLicenseTables.licenseState

/** 完整 schema（业务 + auth + license 内置表） */
export const fullSqliteSchema = {
  ...sqliteSchema,
  ...sqliteAuthTables,
  ...sqliteLicenseTables,
}
