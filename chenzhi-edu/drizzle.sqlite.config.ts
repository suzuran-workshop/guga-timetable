/**
 * drizzle-kit 配置（sqlite 方言）。
 * 生成迁移：npm run db:generate → drizzle/sqlite/*.sql
 *
 * 注：此处内联 defineDrizzleKitConfig 的等价对象（dialect/schema/out 三字段），
 * 因为 drizzle-kit 的 jiti 加载器解析不了 @homurajs/db 的 exports main 入口。
 * schema 文件本身仍从 @homurajs/db/schema-helpers 取双方言列配方。
 */
export default {
  dialect: 'sqlite',
  schema: './src/server/db/schema/sqlite.ts',
  out: './drizzle/sqlite',
}
