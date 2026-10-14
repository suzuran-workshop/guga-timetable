import { Hono } from 'hono'
import { orderSchema, OrderStatus } from '../../shared/domain.js'
import type { Services } from '../repo/index.js'
import { requirePerm, jsonBody, currentUser, requireAdmin } from './guards.js'
import { baseQuery } from './crud.js'

/** 订单路由：创建（充值课时）+ 列表 + 状态流转（支付/退款/取消）+ 营收统计。 */
export function orderRoutes(svc: Services): Hono {
  const app = new Hono()

  app.get('/', requirePerm('order:read'), async (c) => {
    const u = new URL(c.req.url)
    const result = await svc.order.list({
      ...baseQuery(c),
      status: (u.searchParams.get('status') as OrderStatus) ?? undefined,
      studentId: u.searchParams.get('studentId') ?? undefined,
    })
    return c.json(result)
  })

  app.get('/:id', requirePerm('order:read'), async (c) => {
    const order = await svc.order.getById(c.req.param('id'))
    if (!order) return c.json({ error: 'not_found' }, 404)
    return c.json(order)
  })

  app.post('/', requirePerm('order:write'), async (c) => {
    const body = await jsonBody(c)
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    const parsed = orderSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 422)
    }
    const created = await svc.order.create(parsed.data, currentUser(c)?.id)
    return c.json(created, 201)
  })

  /** 状态流转：pending→paid（充值课时）、paid→refunded/cancelled（扣回课时） */
  app.post('/:id/status', requirePerm('order:write'), async (c) => {
    const body = await jsonBody<{ status: OrderStatus }>(c)
    if (!body?.status || !OrderStatus.includes(body.status)) {
      return c.json({ error: 'invalid_status', message: '非法订单状态' }, 400)
    }
    const updated = await svc.order.updateStatus(c.req.param('id'), body.status)
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated)
  })

  /** 删除订单（仅 admin，危险操作：不回滚课时，用于清理误录） */
  app.delete('/:id', requireAdmin, async (c) => {
    const ok = await svc.order.remove(c.req.param('id'))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  /** 营收统计：近 N 月 + 课程排行 */
  app.get('/stats/revenue', requirePerm('order:read'), async (c) => {
    const u = new URL(c.req.url)
    const months = Number(u.searchParams.get('months') ?? 6)
    const [byMonth, top] = await Promise.all([
      svc.order.revenueByMonth(months),
      svc.order.topCourses(8),
    ])
    return c.json({ revenueByMonth: byMonth, topCourses: top })
  })

  return app
}
