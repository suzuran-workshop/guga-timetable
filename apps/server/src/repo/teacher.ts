import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, normalizePage, type PageQuery } from './base.js'
import type { TeacherDto, TeacherInput, TeacherStatus } from '@guga/shared'

/** 教师仓储。subjects 以 JSON 列存储（pg jsonb / sqlite text-json，drizzle 透明序列化）。 */
export class TeacherRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(row: any, classCount = 0): TeacherDto {
    return {
      id: row.id,
      name: row.name,
      teacherNo: row.teacherNo,
      phone: row.phone,
      gender: row.gender,
      title: row.title,
      subjects: Array.isArray(row.subjects) ? row.subjects : (row.subjects ? JSON.parse(row.subjects) : []),
      status: row.status,
      remark: row.remark,
      avatarUrl: row.avatarUrl,
      createdAt: Number(row.createdAt),
      classCount,
    }
  }

  async list(q: PageQuery & { status?: TeacherStatus }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.status) conds.push(eq(t.teachers.status, q.status))
    if (q.keyword) {
      const kw = `%${q.keyword}%`
      conds.push(or(like(t.teachers.name, kw), like(t.teachers.teacherNo, kw), like(t.teachers.title, kw)))
    }
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.db.select().from(t.teachers).where(where) : this.db.select().from(t.teachers))
      .orderBy(desc(t.teachers.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.teachers).where(where)
      : this.db.select({ c: count() }).from(t.teachers))
    return { items: rows.map((r: any) => this.toDto(r)), total: Number(totalRow[0]?.c ?? 0), page, pageSize }
  }

  async getById(id: string): Promise<TeacherDto | null> {
    const rows = await this.db.select().from(this.t.teachers).where(eq(this.t.teachers.id, id)).limit(1)
    if (!rows[0]) return null
    const cc = await this.db.select({ c: count() }).from(this.t.classes).where(eq(this.t.classes.teacherId, id))
    return this.toDto(rows[0], Number(cc[0]?.c ?? 0))
  }

  async create(input: TeacherInput): Promise<TeacherDto> {
    const now = this.now()
    const rows = await this.db.insert(this.t.teachers).values({
      ...input, subjects: input.subjects ?? [], status: input.status ?? 'active',
      createdAt: now, updatedAt: now,
    }).returning()
    return this.toDto(rows[0])
  }

  async update(id: string, patch: Partial<TeacherInput>): Promise<TeacherDto | null> {
    const rows = await this.db.update(this.t.teachers).set({ ...patch, updatedAt: this.now() })
      .where(eq(this.t.teachers.id, id)).returning()
    return rows[0] ? this.toDto(rows[0]) : null
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.teachers).where(eq(this.t.teachers.id, id)).returning()
    return rows.length > 0
  }
}
