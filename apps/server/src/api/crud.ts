import { Hono } from 'hono'
import { requirePerm, jsonBody } from './guards.js'
import type { Permission } from '@guga/shared'

/**
 * 通用 CRUD 路由工厂。
 *
 * 标准资源（student/teacher/course/grade…）共享 list/get/create/update/delete 形状，
 * 差异只在 repo 方法与 zod schema。这里把骨架抽出来，各资源传 repo + schema + 权限前缀即可。
 *
 * 路由（挂载在 /api/<resource> 下）：
 *   GET    /            列表（分页 + 过滤，query）
 *   GET    /:id         详情
 *   POST   /            创建（requirePerm write）
 *   PATCH  /:id         更新（requirePerm write）
 *   DELETE /:id         删除（requirePerm delete）
 */

/** 校验结果（zod v4 结构，只取工厂需要的字段；path 用 PropertyKey[] 兼容 symbol） */
type ParseResult<T> = { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }
/**
 * schema 的最小结构契约：safeParse（整体校验）+ partial()（PATCH 部分校验）。
 * 用结构类型而非 ZodObject<TInput> 泛型，避开 zod v4 的深层类型推断开销与不匹配。
 */
interface CrudSchema<TInput> {
  safeParse(data: unknown): ParseResult<TInput>
  partial(): { safeParse(data: unknown): ParseResult<Partial<TInput>> }
}

/** 统一提取校验错误（path 用 String 化，symbol 罕见但兜底） */
function toIssues(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))
}

export interface CrudConfig<TInput, TListQuery> {
  resource: string
  /** 权限前缀，如 'student' → student:read / student:write / student:delete */
  permBase: string
  schema: CrudSchema<TInput>
  repo: {
    list(q: any): Promise<any>
    getById(id: string): Promise<any>
    create(input: TInput, ...rest: any[]): Promise<any>
    update(id: string, patch: Partial<TInput>): Promise<any>
    remove(id: string): Promise<boolean>
  }
  /** 列表查询：把 URL query 解析成 repo.list 的参数 */
  parseListQuery(c: any): TListQuery
  /** 创建时额外注入（如 createdBy） */
  onCreateExtra?(c: any): any[]
}

export function createCrudRoutes<TInput, TListQuery = any>(cfg: CrudConfig<TInput, TListQuery>): Hono {
  const app = new Hono()
  const read = `${cfg.permBase}:read` as Permission
  const write = `${cfg.permBase}:write` as Permission
  const del = `${cfg.permBase}:delete` as Permission

  app.get('/', requirePerm(read), async (c) => {
    const q = cfg.parseListQuery(c)
    const result = await cfg.repo.list(q)
    return c.json(result)
  })

  app.get('/:id', requirePerm(read), async (c) => {
    const item = await cfg.repo.getById(c.req.param('id'))
    if (!item) return c.json({ error: 'not_found', message: `${cfg.resource} 不存在` }, 404)
    return c.json(item)
  })

  app.post('/', requirePerm(write), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = cfg.schema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: toIssues(parsed.error) }, 422)
    }
    const extra = cfg.onCreateExtra ? cfg.onCreateExtra(c) : []
    const created = await cfg.repo.create(parsed.data, ...extra)
    return c.json(created, 201)
  })

  app.patch('/:id', requirePerm(write), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    // PATCH 部分更新：用 schema 的 partial 语义（逐字段校验）
    const partial = cfg.schema.partial().safeParse(body)
    if (!partial.success) {
      return c.json({ error: 'validation_failed', issues: toIssues(partial.error) }, 422)
    }
    const updated = await cfg.repo.update(c.req.param('id'), partial.data)
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated)
  })

  app.delete('/:id', requirePerm(del), async (c) => {
    const ok = await cfg.repo.remove(c.req.param('id'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  return app
}

/** 从 query 取分页/关键词公共参数 */
export function baseQuery(c: any) {
  const u = new URL(c.req.url)
  return {
    page: u.searchParams.get('page') ?? undefined,
    pageSize: u.searchParams.get('pageSize') ?? undefined,
    keyword: u.searchParams.get('keyword') ?? undefined,
  }
}
