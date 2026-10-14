import { and, desc, eq, like, or, sql, count } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { sqliteSchema } from '../db/schema/sqlite.js'
import { pgSchema } from '../db/schema/pg.js'
import { sqliteAuthTables, pgAuthTables } from '@homurajs/auth/tables'

/**
 * 双方言查询收口层。
 *
 * drizzle 的 pg/sqlite query builder 签名一致但类型不同，直接写 `db.select().from(table)`
 * 会因「db 方言 × table 方言」组合类型爆炸而无法静态匹配。这里按 dialect 选 schema，
 * 用 DrizzleQueryable 最小接口收口，业务 repo 只面对统一的表引用。
 *
 * 约定：本项目运行时**只用一种方言**（启动时确定），故 tables 在初始化后固定。
 */

export interface TableRefs {
  students: any
  teachers: any
  courses: any
  classes: any
  classMembers: any
  schedules: any
  attendance: any
  grades: any
  orders: any
  files: any
  profiles: any
  terms: any
  /** @homurajs/auth 的 users 表（身份锚点，库拥有），按方言选取 */
  authUsers: any
}

let refs: TableRefs | null = null
let dialectRef: 'pg' | 'sqlite' = 'sqlite'

export function initTables(b: DbBundle): TableRefs {
  dialectRef = b.dialect
  const schema = b.dialect === 'pg' ? pgSchema : sqliteSchema
  const authTables = b.dialect === 'pg' ? pgAuthTables : sqliteAuthTables
  refs = {
    students: schema.students,
    teachers: schema.teachers,
    courses: schema.courses,
    classes: schema.classes,
    classMembers: schema.classMembers,
    schedules: schema.schedules,
    attendance: schema.attendance,
    grades: schema.grades,
    orders: schema.orders,
    files: schema.files,
    profiles: schema.profiles,
    terms: schema.terms,
    authUsers: authTables.users,
  }
  return refs
}

export function tables(): TableRefs {
  if (!refs) throw new Error('表引用未初始化')
  return refs
}

export function dialect(): 'pg' | 'sqlite' {
  return dialectRef
}

/** 重新导出 drizzle 算子，供 repo 统一 import */
export { and, desc, eq, like, or, sql, count }
