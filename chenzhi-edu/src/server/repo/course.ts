import { and, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, normalizePage, type PageQuery } from './base.js'
import type { CourseDto, CourseInput, CourseStatus } from '../../shared/domain.js'

/** 课程仓储。附带班级数与在读学员数聚合。 */
export class CourseRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(row: any, classCount = 0, studentCount = 0): CourseDto {
    return {
      id: row.id, name: row.name, code: row.code, subject: row.subject,
      creditHours: Number(row.creditHours), totalLessons: Number(row.totalLessons),
      pricePerLesson: Number(row.pricePerLesson), colorIndex: Number(row.colorIndex),
      description: row.description, status: row.status, classCount, studentCount,
    }
  }

  async list(q: PageQuery & { status?: CourseStatus }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.status) conds.push(eq(t.courses.status, q.status))
    if (q.keyword) {
      const kw = `%${q.keyword}%`
      conds.push(or(like(t.courses.name, kw), like(t.courses.code, kw), like(t.courses.subject, kw)))
    }
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.db.select().from(t.courses).where(where) : this.db.select().from(t.courses))
      .orderBy(desc(t.courses.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.courses).where(where)
      : this.db.select({ c: count() }).from(t.courses))
    // 班级数聚合
    const ids = rows.map((r: any) => r.id)
    let classCounts: Record<string, number> = {}
    if (ids.length) {
      const cc = await this.db.select({ courseId: t.classes.courseId, c: count() })
        .from(t.classes).where(inArray(t.classes.courseId, ids))
        .groupBy(t.classes.courseId)
      classCounts = Object.fromEntries(cc.map((r: any) => [r.courseId, Number(r.c)]))
    }
    return {
      items: rows.map((r: any) => this.toDto(r, classCounts[r.id] ?? 0)),
      total: Number(totalRow[0]?.c ?? 0), page, pageSize,
    }
  }

  async getById(id: string): Promise<CourseDto | null> {
    const rows = await this.db.select().from(this.t.courses).where(eq(this.t.courses.id, id)).limit(1)
    return rows[0] ? this.toDto(rows[0]) : null
  }

  async getAll(): Promise<CourseDto[]> {
    const rows = await this.db.select().from(this.t.courses).orderBy(this.t.courses.name)
    return rows.map((r: any) => this.toDto(r))
  }

  async create(input: CourseInput): Promise<CourseDto> {
    const now = this.now()
    const rows = await this.db.insert(this.t.courses).values({
      ...input, status: input.status ?? 'active', colorIndex: input.colorIndex ?? 1,
      createdAt: now, updatedAt: now,
    }).returning()
    return this.toDto(rows[0])
  }

  async update(id: string, patch: Partial<CourseInput>): Promise<CourseDto | null> {
    const rows = await this.db.update(this.t.courses).set({ ...patch, updatedAt: this.now() })
      .where(eq(this.t.courses.id, id)).returning()
    return rows[0] ? this.toDto(rows[0]) : null
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.courses).where(eq(this.t.courses.id, id)).returning()
    return rows.length > 0
  }
}
