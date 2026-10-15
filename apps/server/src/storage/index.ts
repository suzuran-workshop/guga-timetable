import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLocalStorage } from '@homurajs/storage/local'
import type { FileStorage } from '@homurajs/storage'
import { createLogger } from '@homurajs/core'

/**
 * 对象存储装配（@homurajs/storage）。
 *
 * 当前用 local-fs 后端（独立单机形态缺省）：字节落 STORAGE_DIR，
 * 下载统一走 /files/<key> 代理路由（不暴露存储地址）。
 * 需要 S3/supabase 后端时在此切换（契约同为 FileStorage）。
 */
export function createStorage(storageDir: string): FileStorage {
  const logger = createLogger().child('storage')
  const root = resolve(storageDir)
  mkdirSync(root, { recursive: true })
  logger.info('对象存储就绪（local-fs）', { root })
  return createLocalStorage({ rootDir: root })
}
