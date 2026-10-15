import { and, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, normalizePage, type PageQuery } from './base.js'
import type {
  StudentDto, StudentInput, StudentStatus, ClassDto, ScheduleDto,
} from '../../shared/domain.js'

/** 学员仓储 + 课时余额管理。 */
export class StudentRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(row: any, classCount = 0): StudentDto {
    return {
      id: row.id,
      name: row.name,
      studentNo: row.studentNo,
      phone: row.phone,
      gender: row.gender,
      birthDate: row.birthDate,
      gradeLevel: row.gradeLevel,
      guardianName: row.guardianName,
      guardianPhone: row.guardianPhone,
      address: row.address,
      status: row.status,
      balanceLessons: row.balanceLessons,
      remark: row.remark,
      avatarUrl: row.avatarUrl,
      createdAt: Number(row.createdAt),
      classCount,
    }
  }

  async list(q: PageQuery & { status?: StudentStatus }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.status) conds.push(eq(t.students.status, q.status))
    if (q.keyword) {
      const kw = `%${q.keyword}%`
      conds.push(or(like(t.students.name, kw), like(t.students.studentNo, kw), like(t.students.phone, kw)))
    }
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.db.select().from(t.students).where(where) : this.db.select().from(t.students))
      .orderBy(desc(t.students.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.students).where(where)
      : this.db.select({ c: count() }).from(t.students))
    const total = Number(totalRow[0]?.c ?? 0)
    // 每个学员的在读班级数
    const ids = rows.map((r: any) => r.id)
    let memberCounts: Record<string, number> = {}
    if (ids.length) {
      const mc = await this.db.select({ studentId: t.classMembers.studentId, c: count() })
        .from(t.classMembers).where(inArray(t.classMembers.studentId, ids))
        .groupBy(t.classMembers.studentId)
      memberCounts = Object.fromEntries(mc.map((r: any) => [r.studentId, Number(r.c)]))
    }
    return {
      items: rows.map((r: any) => this.toDto(r, memberCounts[r.id] ?? 0)),
      total, page, pageSize,
    }
  }

  async getById(id: string): Promise<StudentDto | null> {
    const rows = await this.db.select().from(this.t.students).where(eq(this.t.students.id, id)).limit(1)
    if (!rows[0]) return null
    const mc = await this.db.select({ c: count() }).from(this.t.classMembers).where(eq(this.t.classMembers.studentId, id))
    return this.toDto(rows[0], Number(mc[0]?.c ?? 0))
  }

  async create(input: StudentInput, createdBy?: string): Promise<StudentDto> {
    const now = this.now()
    const rows = await this.db.insert(this.t.students).values({
      ...input,
      gender: input.gender ?? 'unknown',
      status: input.status ?? 'active',
      balanceLessons: input.balanceLessons ?? 0,
      createdBy,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return this.toDto(rows[0])
  }

  async update(id: string, patch: Partial<StudentInput>): Promise<StudentDto | null> {
    const rows = await this.db.update(this.t.students)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(this.t.students.id, id)).returning()
    if (!rows[0]) return null
    return this.toDto(rows[0])
  }

  async remove(id: string): Promise<boolean> {
    const t = this.t
    // 级联清理成员关系、考勤、成绩（订单保留作财务凭证）
    await this.db.delete(t.classMembers).where(eq(t.classMembers.studentId, id))
    await this.db.delete(t.attendance).where(eq(t.attendance.studentId, id))
    await this.db.delete(t.grades).where(eq(t.grades.studentId, id))
    const rows = await this.db.delete(t.students).where(eq(t.students.id, id)).returning()
    return rows.length > 0
  }

  /** 增减课时余额（订单充值 +，考勤消耗 −）。返回新余额。 */
  async adjustBalance(id: string, delta: number): Promise<number> {
    const t = this.t
    const rows = await this.db.update(t.students)
      .set({ balanceLessons: this.floorAt(t.students.balanceLessons, delta), updatedAt: this.now() })
      .where(eq(t.students.id, id)).returning()
    return Number(rows[0]?.balanceLessons ?? 0)
  }

  /** 低课时余额预警（<= threshold） */
  async lowBalance(threshold = 3) {
    const t = this.t
    const rows = await this.db.select().from(t.students)
      .where(and(eq(t.students.status, 'active'), sql`${t.students.balanceLessons} <= ${threshold}`))
      .orderBy(t.students.balanceLessons)
    return rows.map((r: any) => this.toDto(r))
  }

  async countByStatus(): Promise<{ status: string; count: number }[]> {
    const t = this.t
    const rows = await this.db.select({ status: t.students.status, c: count() })
      .from(t.students).groupBy(t.students.status)
    return rows.map((r: any) => ({ status: r.status, count: Number(r.c) }))
  }
}
