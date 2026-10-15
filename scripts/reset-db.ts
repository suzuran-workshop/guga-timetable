import { rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig } from '../src/server/env.js'
import { createLogger } from '@homurajs/core'

/**
 * 重置数据库（npm run db:reset）：删除 sqlite 文件，下次启动/迁移时重建空库。
 *
 * ⚠ 破坏性操作：仅用于本地开发。pg 形态不支持（避免误删生产库），请手动 DROP。
 * 重置后需重新 `npm run db:migrate && npm run db:seed`。
 */
const logger = createLogger().child('reset-db')
const cfg = loadConfig()

if (cfg.get('databaseUrl').trim()) {
  logger.error('db:reset 仅支持 sqlite 形态；检测到 DATABASE_URL，为安全起见中止')
  console.error('检测到 pg 配置，拒绝执行破坏性重置。请手动操作数据库。')
  process.exit(1)
}

const path = resolve(cfg.get('dbPath'))
if (cfg.get('dbPath') === ':memory:') {
  logger.info('内存库无需重置')
  process.exit(0)
}

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  const f = path + suffix
  if (existsSync(f)) {
    rmSync(f)
    logger.info('已删除', { file: f })
  }
}
console.log(`✅ 已重置 sqlite 数据库（${path}）。接下来运行：npm run db:migrate && npm run db:seed`)
