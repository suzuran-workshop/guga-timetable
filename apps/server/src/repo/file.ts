import { and, count, desc, eq } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository } from './base.js'

/** 文件登记仓储（配合 @homurajs/storage）。仅存元数据，字节在对象存储。 */
export class FileRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  async register(input: {
    objectKey: string; fileName: string; contentType?: string | null;
    size: number; ns: string; uploadedBy?: string | null
  }) {
    const rows = await this.db.insert(this.t.files).values({
      ...input, contentType: input.contentType ?? null, uploadedBy: input.uploadedBy ?? null,
      createdAt: this.now(),
    }).returning()
    return this.toDto(rows[0])
  }

  private toDto(r: any) {
    return {
      id: r.id, objectKey: r.objectKey, fileName: r.fileName, contentType: r.contentType,
      size: Number(r.size), ns: r.ns, uploadedBy: r.uploadedBy, createdAt: Number(r.createdAt),
    }
  }

  async listByNs(ns: string, limit = 50) {
    const t = this.t
    const rows = await this.db.select().from(t.files)
      .where(eq(t.files.ns, ns)).orderBy(desc(t.files.createdAt)).limit(limit)
    return rows.map((r: any) => this.toDto(r))
  }

  async getById(id: string) {
    const rows = await this.db.select().from(this.t.files).where(eq(this.t.files.id, id)).limit(1)
    return rows[0] ? this.toDto(rows[0]) : null
  }

  async remove(id: string): Promise<string | null> {
    const rows = await this.db.delete(this.t.files).where(eq(this.t.files.id, id)).returning()
    return rows[0]?.objectKey ?? null
  }
}
