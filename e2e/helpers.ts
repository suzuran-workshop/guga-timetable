import { expect, type Page } from '@playwright/test'

/**
 * E2E 共享工具（无 test 注册，供各 spec 导入）。
 */

export const ADMIN = { username: 'admin', password: 'guga@2025' }

/** 通过 UI 以管理员登录。调用后 page 停在首页，cookie 已写入 context。 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(ADMIN.username)
  await page.getByLabel('密码').fill(ADMIN.password)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/$/)
}

/** 唯一后缀，避免重跑数据冲突 */
export const uniq = () => Math.random().toString(36).slice(2, 8)
