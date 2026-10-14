import type { DbBundle } from '../db/index.js'
import { tables } from '../db/tables.js'

/**
 * 仓储基类——把双方言 db 实例收口成 `any`，业务 repo 面对统一查询接口。
 *
 * 为什么用 any：drizzle 的 pg/sqlite query builder 类型不同，联合类型会让
 * `db.select().from(table)` 的 4 种「db×table」组合无法静态匹配（其中 2 种非法）。
 * @homurajs/db 的 DrizzleQueryable 就是为此设计的最小接口；这里等价收口。
 *
 * 查询用 thenable（await builder 即执行），双方言一致。
 */
export class Repository {
  protected db: any
  protected t = tables()

  constructor(bundle: DbBundle) {
    this.db = bundle.db
  }

  /** epoch ms now */
  protected now(): number {
    return Date.now()
  }
}

/** 分页参数 */
export interface PageQuery {
  page?: number
  pageSize?: number
  keyword?: string
}

/** 规范化分页参数 */
export function normalizePage(q: PageQuery): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 生成订单号：DD + 时间戳 + 4 位随机 */
export function genOrderNo(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `DD${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${rand}`
}
