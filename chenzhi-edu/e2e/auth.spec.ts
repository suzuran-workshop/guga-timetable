import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers.js'

/**
 * E2E 认证流（@homurajs/auth）：
 * 登录页渲染 → 错误凭证拒绝 → admin 登录成功 → 会话 cookie → /api/users/me 角色权限
 * → 退出登录 → 会话失效 → 受保护页重定向回登录。
 *
 * 覆盖模块：core（配置/健康检查）、app-kit（SPA 托管 + 路由）、auth（密码登录 + JWT 会话）、
 *           db（用户/档案读取）、license（登录页展示授权状态）。
 */

test.describe('认证与会话', () => {
  test('未登录访问受保护页 → 重定向到 /login', async ({ page }) => {
    await page.goto('/students')
    await expect(page).toHaveURL(/\/login/)
    // 登录页核心元素可见（CardTitle 渲染为 div，用 getByText）
    await expect(page.getByText('账户登录')).toBeVisible()
    await expect(page.getByRole('heading', { name: '辰知教务' })).toBeVisible()
  })

  test('登录页展示授权状态（license 模块经 /_license 豁免路径）', async ({ page }) => {
    await page.goto('/login')
    // 授权状态行：正常 + 已验签（genuine-mock 以 active 签名）
    await expect(page.getByText(/授权状态/)).toBeVisible()
    await expect(page.getByText('已验签')).toBeVisible()
  })

  test('错误密码 → 拒绝并提示', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('用户名').fill('admin')
    await page.getByLabel('密码').fill('wrong-password')
    await page.getByRole('button', { name: '登录' }).click()
    // 仍停留在登录页 + 错误 toast
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('用户名或密码错误')).toBeVisible()
  })

  test('admin 登录成功 → 进入工作台', async ({ page }) => {
    await loginAsAdmin(page)
    // 顶栏显示管理员昵称
    await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  })

  test('会话携带角色与权限（RBAC 来自 profiles 表）', async ({ page, request }) => {
    await loginAsAdmin(page)
    // 用同一 cookie 上下文请求 /api/users/me
    const res = await page.request.get('/api/users/me')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.username).toBe('admin')
    expect(body.user.role).toBe('admin')
    expect(body.user.permissions).toContain('student:write')
    expect(body.user.permissions).toContain('order:write')
  })

  test('退出登录 → 会话失效 → 重定向回登录页', async ({ page }) => {
    await loginAsAdmin(page)
    // 打开用户菜单并退出
    await page.getByRole('button', { name: /教务管理员|admin/ }).first().click()
    await page.getByRole('menuitem', { name: /退出登录/ }).click()
    await expect(page).toHaveURL(/\/login/)
    // 会话已失效：受保护 API 返回 401
    const res = await page.request.get('/api/users/me')
    expect(res.status()).toBe(401)
  })
})
