import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository, normalizePage, type PageQuery } from './base.js'
import type { GradeDto, GradeInput } from '@guga/shared'

/** 成绩仓储。 */
export class GradeRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toDto(r: any): GradeDto {
    return {
      id: r.id, studentId: r.studentId, studentName: r.studentName ?? r._studentName ?? '',
      classId: r.classId, className: r.className ?? r._className ?? null,
      examName: r.examName, score: Number(r.score), fullScore: Number(r.fullScore),
      examDate: r.examDate, remark: r.remark,
    }
  }

  private selectJoined() {
    const t = this.t
    return this.db.select({
      id: t.grades.id, studentId: t.grades.studentId, classId: t.grades.classId,
      examName: t.grades.examName, score: t.grades.score, fullScore: t.grades.fullScore,
      examDate: t.grades.examDate, remark: t.grades.remark,
      _studentName: t.students.name, _className: t.classes.name,
    }).from(t.grades)
      .leftJoin(t.students, eq(t.grades.studentId, t.students.id))
      .leftJoin(t.classes, eq(t.grades.classId, t.classes.id))
  }

  async list(q: PageQuery & { studentId?: string; classId?: string; examName?: string }) {
    const { page, pageSize, offset } = normalizePage(q)
    const t = this.t
    const conds: any[] = []
    if (q.studentId) conds.push(eq(t.grades.studentId, q.studentId))
    if (q.classId) conds.push(eq(t.grades.classId, q.classId))
    if (q.examName) conds.push(like(t.grades.examName, `%${q.examName}%`))
    const where = conds.length ? and(...conds) : undefined
    const rows = await (where ? this.selectJoined().where(where) : this.selectJoined())
      .orderBy(desc(t.grades.examDate), desc(t.grades.createdAt)).limit(pageSize).offset(offset)
    const totalRow = await (where
      ? this.db.select({ c: count() }).from(t.grades).where(where)
      : this.db.select({ c: count() }).from(t.grades))
    return { items: rows.map((r: any) => this.toDto(r)), total: Number(totalRow[0]?.c ?? 0), page, pageSize }
  }

  async getById(id: string): Promise<GradeDto | null> {
    const rows = await this.selectJoined().where(eq(this.t.grades.id, id)).limit(1)
    return rows[0] ? this.toDto(rows[0]) : null
  }

  async create(input: GradeInput): Promise<GradeDto> {
    const now = this.now()
    const rows = await this.db.insert(this.t.grades).values({
      ...input, fullScore: input.fullScore ?? 100, createdAt: now, updatedAt: now,
    }).returning()
    const joined = await this.selectJoined().where(eq(this.t.grades.id, rows[0].id)).limit(1)
    return this.toDto(joined[0])
  }

  async update(id: string, patch: Partial<GradeInput>): Promise<GradeDto | null> {
    await this.db.update(this.t.grades).set({ ...patch, updatedAt: this.now() }).where(eq(this.t.grades.id, id))
    const joined = await this.selectJoined().where(eq(this.t.grades.id, id)).limit(1)
    return joined[0] ? this.toDto(joined[0]) : null
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.delete(this.t.grades).where(eq(this.t.grades.id, id)).returning()
    return rows.length > 0
  }

  /** 学员平均分（个人档案） */
  async avgScore(studentId: string): Promise<number> {
    const t = this.t
    const rows = await this.db.select({ avg: sql`AVG(${t.grades.score} * 100.0 / ${t.grades.fullScore})` })
      .from(t.grades).where(eq(t.grades.studentId, studentId))
    const v = Number(rows[0]?.avg ?? 0)
    return Math.round(v * 10) / 10
  }

  async listByStudent(studentId: string) {
    const rows = await this.selectJoined().where(eq(this.t.grades.studentId, studentId))
      .orderBy(desc(this.t.grades.examDate))
    return rows.map((r: any) => this.toDto(r))
  }
}
