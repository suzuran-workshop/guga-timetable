/**
 * drizzle-kit 配置（pg 方言）。
 * 生成迁移：npx drizzle-kit generate --config drizzle.pg.config.ts → drizzle/pg/*.sql
 * 内联原因同 drizzle.sqlite.config.ts。
 */
export default {
  dialect: 'postgresql',
  schema: './apps/server/src/db/schema/pg.ts',
  out: './drizzle/pg',
}