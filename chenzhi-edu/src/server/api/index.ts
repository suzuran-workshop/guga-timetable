import { Hono } from 'hono'
import type { Services } from '../repo/index.js'
import type { ProfileRepo } from '../repo/profile.js'
import type { FileStorage } from '@homurajs/storage'
import { attachUser, requireLogin } from './guards.js'
import { studentRoutes } from './students.js'
import { teacherRoutes } from './teachers.js'
import { courseRoutes } from './courses.js'
import { classRoutes } from './classes.js'
import { scheduleRoutes } from './schedules.js'
import { attendanceRoutes } from './attendance.js'
import { gradeRoutes } from './grades.js'
import { orderRoutes } from './orders.js'
import { fileRoutes } from './files.js'
import { userRoutes } from './users.js'
import { dashboardRoutes } from './dashboard.js'
import { termRoutes } from './terms.js'

/**
 * 业务 API 总路由（挂在 /api，位于 createApp 的 sessionMiddleware 之后）。
 *
 * 链：attachUser（claims → SessionUser）→ requireLogin → 各资源子路由（requirePerm 逐点鉴权）。
 *
 * 不在此处的根级路由（由 main server 直接挂载，避开 requireLogin / license 守卫核心拦截）：
 * - /_license 授权状态（守卫豁免，停服时前端仍可读「为什么被停」）
 * - /files/*  对象存储代理下载
 * - /auth/*   登录链（@homurajs/auth，守卫豁免）
 */
export function createApiRoutes(opts: {
  svc: Services
  profiles: ProfileRepo
  storage: FileStorage
  ns?: string
}): Hono {
  const { svc, profiles, storage } = opts
  const api = new Hono()

  // 全 API 先解析会话用户，再要求登录
  api.use('*', attachUser(profiles))
  api.use('*', requireLogin)

  api.route('/dashboard', dashboardRoutes(svc))
  api.route('/students', studentRoutes(svc))
  api.route('/teachers', teacherRoutes(svc))
  api.route('/courses', courseRoutes(svc))
  api.route('/classes', classRoutes(svc))
  api.route('/schedules', scheduleRoutes(svc))
  api.route('/attendance', attendanceRoutes(svc))
  api.route('/grades', gradeRoutes(svc))
  api.route('/orders', orderRoutes(svc))
  api.route('/files', fileRoutes(svc, storage, opts.ns))
  api.route('/users', userRoutes(svc, profiles)) // /api/users/me + /api/users 管理
  api.route('/terms', termRoutes(svc))

  return api
}
