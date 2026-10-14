import { pgCol, pgJson, pgTable } from '@homurajs/db/schema-helpers'
import { pgAuthTables } from '@homurajs/auth/tables'
import { pgLicenseTables } from '@homurajs/license/tables'
import { boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * 业务表（PostgreSQL 方言）。
 * 与 ./sqlite.ts 保持字段同构（assertSchemaParity 校验表名/列名/主键）。
 *
 * 约定：
 * - 列名走 drizzle 默认（= JS 属性名，camelCase），双方言一致，索引用 builder API 引用列对象。
 * - 时间列统一 epochMs（bigint number），双方言原生 SQL 读写一致（node:sqlite 不接受 Date）。
 * - 金额/课时用整数（分、课时数），避免浮点。
 */

const nowMs = sql`(extract(epoch from now()) * 1000)::bigint`

export const students = pgTable('students', {
  id: pgCol.id(),
  name: pgCol.text().notNull(),
  studentNo: pgCol.text().notNull(),
  phone: pgCol.text(),
  gender: pgCol.text().notNull().default('unknown'),
  birthDate: pgCol.text(),
  gradeLevel: pgCol.text(),
  guardianName: pgCol.text(),
  guardianPhone: pgCol.text(),
  address: pgCol.text(),
  status: pgCol.text().notNull().default('active'),
  balanceLessons: pgCol.int().notNull().default(0),
  remark: pgCol.text(),
  avatarUrl: pgCol.text(),
  createdBy: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('students_no_idx').on(t.studentNo),
  index('students_status_idx').on(t.status),
])

export const teachers = pgTable('teachers', {
  id: pgCol.id(),
  name: pgCol.text().notNull(),
  teacherNo: pgCol.text().notNull(),
  phone: pgCol.text(),
  gender: pgCol.text().notNull().default('unknown'),
  title: pgCol.text(),
  subjects: pgJson<string[]>(),
  status: pgCol.text().notNull().default('active'),
  remark: pgCol.text(),
  avatarUrl: pgCol.text(),
  userId: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('teachers_no_idx').on(t.teacherNo),
])

export const courses = pgTable('courses', {
  id: pgCol.id(),
  name: pgCol.text().notNull(),
  code: pgCol.text().notNull(),
  subject: pgCol.text(),
  creditHours: pgCol.int().notNull().default(0),
  totalLessons: pgCol.int().notNull().default(0),
  pricePerLesson: pgCol.int().notNull().default(0),
  colorIndex: pgCol.int().notNull().default(1),
  description: pgCol.text(),
  status: pgCol.text().notNull().default('active'),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('courses_code_idx').on(t.code),
])

export const classes = pgTable('classes', {
  id: pgCol.id(),
  name: pgCol.text().notNull(),
  courseId: pgCol.text().notNull(),
  teacherId: pgCol.text(),
  room: pgCol.text(),
  capacity: pgCol.int().notNull().default(30),
  startDate: pgCol.text(),
  status: pgCol.text().notNull().default('recruiting'),
  remark: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('classes_course_idx').on(t.courseId),
])

/** 班级成员（多对多：班级 ↔ 学员） */
export const classMembers = pgTable('class_members', {
  id: pgCol.id(),
  classId: pgCol.text().notNull(),
  studentId: pgCol.text().notNull(),
  joinedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('class_members_uniq').on(t.classId, t.studentId),
])

export const schedules = pgTable('schedules', {
  id: pgCol.id(),
  classId: pgCol.text().notNull(),
  weekday: pgCol.int().notNull(),
  startPeriod: pgCol.int().notNull(),
  endPeriod: pgCol.int().notNull(),
  weekStart: pgCol.int().notNull().default(1),
  weekEnd: pgCol.int().notNull().default(20),
  room: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('schedules_class_idx').on(t.classId),
  index('schedules_day_idx').on(t.weekday),
])

export const attendance = pgTable('attendance', {
  id: pgCol.id(),
  scheduleId: pgCol.text().notNull(),
  studentId: pgCol.text().notNull(),
  lessonDate: pgCol.text().notNull(),
  status: pgCol.text().notNull().default('present'),
  consumedLessons: pgCol.int().notNull().default(1),
  remark: pgCol.text(),
  markedBy: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('attendance_uniq').on(t.scheduleId, t.studentId, t.lessonDate),
  index('attendance_date_idx').on(t.lessonDate),
])

export const grades = pgTable('grades', {
  id: pgCol.id(),
  studentId: pgCol.text().notNull(),
  classId: pgCol.text(),
  examName: pgCol.text().notNull(),
  score: pgCol.int().notNull().default(0),
  fullScore: pgCol.int().notNull().default(100),
  examDate: pgCol.text().notNull(),
  remark: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('grades_student_idx').on(t.studentId),
])

export const orders = pgTable('orders', {
  id: pgCol.id(),
  orderNo: pgCol.text().notNull(),
  studentId: pgCol.text().notNull(),
  courseId: pgCol.text().notNull(),
  lessonsPurchased: pgCol.int().notNull(),
  amount: pgCol.int().notNull(),
  payMethod: pgCol.text().notNull().default('wechat'),
  status: pgCol.text().notNull().default('pending'),
  paidAt: pgCol.text(),
  remark: pgCol.text(),
  createdBy: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  uniqueIndex('orders_no_idx').on(t.orderNo),
  index('orders_student_idx').on(t.studentId),
])

/** 文件登记（@homurajs/storage 上传后落库，objectKey 指向代理路径） */
export const files = pgTable('files', {
  id: pgCol.id(),
  objectKey: pgCol.text().notNull(),
  fileName: pgCol.text().notNull(),
  contentType: pgCol.text(),
  size: pgCol.int().notNull().default(0),
  ns: pgCol.text().notNull(),
  uploadedBy: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
})

/**
 * 用户档案扩展：auth 的 users 表由库拥有（无 role 列），
 * 本表以 userId 为外键补充教务系统的 RBAC 角色与展示信息。
 */
export const profiles = pgTable('profiles', {
  userId: pgCol.text('user_id').primaryKey(),
  role: pgCol.text().notNull().default('viewer'),
  realName: pgCol.text(),
  phone: pgCol.text(),
  teacherId: pgCol.text(),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
})

/**
 * 学期：日期 ↔ 教学周 的锚点。
 * startDate 规整为第 1 周周一，totalWeeks 界定教学周范围；isCurrent 标记当前学期。
 */
export const terms = pgTable('terms', {
  id: pgCol.id(),
  name: pgCol.text().notNull(),
  startDate: pgCol.text().notNull(),
  endDate: pgCol.text().notNull(),
  totalWeeks: pgCol.int().notNull().default(20),
  isCurrent: boolean().notNull().default(false),
  createdAt: pgCol.epochMs().notNull().default(nowMs),
  updatedAt: pgCol.epochMs().notNull().default(nowMs),
}, (t) => [
  index('terms_start_idx').on(t.startDate),
])

/** 业务 schema 汇总（迁移与 parity 校验用） */
export const pgSchema = {
  students, teachers, courses, classes, classMembers, schedules,
  attendance, grades, orders, files, profiles, terms,
}

/** 完整 schema（业务 + auth + license 内置表） */
export const fullPgSchema = {
  ...pgSchema,
  ...pgAuthTables,
  ...pgLicenseTables,
}
