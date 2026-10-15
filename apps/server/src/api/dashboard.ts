import { Hono } from 'hono'
import type { Services } from '../repo/index.js'
import { requirePerm } from './guards.js'
import { PERIODS } from '@guga/shared'

/** 仪表盘路由：首页聚合统计 + 节次作息表（排课引用）。 */
export function dashboardRoutes(svc: Services): Hono {
  const app = new Hono()

  app.get('/stats', requirePerm('dashboard:read'), async (c) => {
    return c.json(await svc.dashboard.stats())
  })

  /** 节次作息定义（前端课表渲染 Y 轴用） */
  app.get('/periods', async (c) => {
    return c.json({ items: PERIODS })
  })

  return app
}
