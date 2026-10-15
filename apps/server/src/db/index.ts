import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { assertSchemaParity, createDb, isSqlite, runMigrations } from '@homurajs/db'
import type { Database } from '@homurajs/db'
import { createLogger, type Logger } from '@homurajs/core'
import { pgSchema } from './schema/pg.js'
import { sqliteSchema } from './schema/sqlite.js'

/**
 * 数据库引导（@homurajs/db）。
 *
 * - 按配置选择方言：DATABASE_URL 非空 → pg；否则 node:sqlite。
 * - 启动即跑双方言 parity 校验（表名/列名/主键一致），schema 漂移立刻 fail-fast。
 * - 运行迁移（drizzle/<dialect> 目录）。
 *
 * 返回的 Database 是 drizzle 实例（pg 或 sqlite），repo 层通过 DrizzleQueryable 收口。
 */

export interface DbBundle {
  db: Database
  dialect: 'pg' | 'sqlite'
  logger: Logger
}

let bundle: DbBundle | null = null

export function createDatabase(opts: {
  dbPath: string
  databaseUrl: string
  logger?: Logger
}): DbBundle {
  const logger = (opts.logger ?? createLogger()).child('db')

  // schema parity：双方言业务表必须同构（fail-fast，避免上线后 pg/sqlite 行为分叉）
  assertSchemaParity(pgSchema as unknown as Record<string, unknown>, sqliteSchema as unknown as Record<string, unknown>)
  logger.info('schema parity 校验通过', { tables: Object.keys(sqliteSchema).length })

  const usePg = opts.databaseUrl.trim().length > 0
  let db: Database
  let dialect: 'pg' | 'sqlite'

  if (usePg) {
    db = createDb({ dialect: 'pg', url: opts.databaseUrl })
    dialect = 'pg'
    logger.info('使用 PostgreSQL', { url: opts.databaseUrl.replace(/:[^:@/]+@/, ':***@') })
  } else {
    const path = opts.dbPath === ':memory:' ? ':memory:' : resolve(opts.dbPath)
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    db = createDb({ dialect: 'sqlite', path })
    dialect = 'sqlite'
    logger.info('使用 node:sqlite', { path })
  }

  bundle = { db, dialect, logger }
  return bundle
}

/** 运行迁移（drizzle-kit generate 产出的 SQL）。dialect 决定迁移目录。 */
export async function migrate(b: DbBundle = getDb()): Promise<void> {
  const folder = b.dialect === 'pg' ? 'drizzle/pg' : 'drizzle/sqlite'
  await runMigrations(b.db, folder)
  b.logger.info('迁移完成', { folder })
}

export function getDb(): DbBundle {
  if (!bundle) throw new Error('数据库尚未初始化（先调用 createDatabase）')
  return bundle
}

export { isSqlite }
