import { createDb, runMigrations } from '@homurajs/db'
import { createLogger } from '@homurajs/core'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadConfig } from '../src/server/env.js'

/**
 * 独立迁移脚本（npm run db:migrate）。
 * 与 server 启动时 migrate() 同源，但可单独运行（CI / 部署前置步骤）。
 */
const logger = createLogger().child('migrate')
const cfg = loadConfig()

const usePg = cfg.get('databaseUrl').trim().length > 0
const dialect = usePg ? 'pg' : 'sqlite'
const folder = resolve(usePg ? 'drizzle/pg' : 'drizzle/sqlite')

const db = usePg
  ? createDb({ dialect: 'pg', url: cfg.get('databaseUrl') })
  : (() => {
      const p = cfg.get('dbPath') === ':memory:' ? ':memory:' : resolve(cfg.get('dbPath'))
      if (p !== ':memory:') mkdirSync(dirname(p), { recursive: true })
      return createDb({ dialect: 'sqlite', path: p })
    })()

logger.info('开始迁移', { dialect, folder })
await runMigrations(db, folder)
logger.info('迁移完成')
process.exit(0)
