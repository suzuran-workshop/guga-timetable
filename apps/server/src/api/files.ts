import { Hono } from 'hono'
import type { FileStorage } from '@homurajs/storage'
import { createFileProxyRoutes } from '@homurajs/storage/proxy'
import type { Services } from '../repo/index.js'
import { requirePerm, currentUser } from './guards.js'

/**
 * 文件路由（@homurajs/storage）：上传登记 + 代理下载 + 列表。
 *
 * - POST /api/files/upload  multipart 上传 → storage.uploadFile → files 表登记 → 返回元数据 + 代理 URL
 * - GET  /api/files         按 ns 列表
 * - GET  /files/:key        代理下载（createFileProxyRoutes，storage 的统一入口）
 *
 * ns（命名空间）做租户隔离：这里用 'guga' 固定 ns（单机演示），
 * 真实多租户可用 userId / orgId 作 ns 前缀。
 */
export function fileRoutes(svc: Services, storage: FileStorage, ns = 'guga'): Hono {
  const app = new Hono()

  app.post('/upload', requirePerm('file:write'), async (c) => {
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || !(file instanceof File)) return c.json({ error: 'missing_file', message: '需要 multipart 字段 file' }, 400)
    if (file.size > 20 * 1024 * 1024) return c.json({ error: 'file_too_large', message: '文件超过 20MB 限制' }, 413)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const uploaded = await storage.uploadFile(ns, file.name, bytes, file.type || 'application/octet-stream')
    const meta = await svc.file.register({
      objectKey: uploaded.objectKey,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: uploaded.size,
      ns,
      uploadedBy: currentUser(c)?.id ?? null,
    })
    return c.json({ ...meta, url: uploaded.url }, 201)
  })

  app.get('/', requirePerm('file:read'), async (c) => {
    const u = new URL(c.req.url)
    const limit = Number(u.searchParams.get('limit') ?? 50)
    return c.json({ items: await svc.file.listByNs(ns, limit) })
  })

  app.delete('/:id', requirePerm('file:write'), async (c) => {
    const meta = await svc.file.getById(c.req.param('id'))
    if (!meta) return c.json({ error: 'not_found' }, 404)
    await storage.deleteFile(meta.objectKey)
    await svc.file.remove(c.req.param('id'))
    return c.json({ ok: true })
  })

  return app
}

/** 代理下载路由（挂在根 /files，storage 统一入口） */
export function fileProxyRoutes(storage: FileStorage): Hono {
  return createFileProxyRoutes(storage)
}
