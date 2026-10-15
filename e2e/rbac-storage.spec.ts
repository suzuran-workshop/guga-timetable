import { test, expect } from '@playwright/test'
import { loginAsAdmin, uniq } from './helpers.js'

/**
 * E2E 权限与存储流：
 * - RBAC UI 门控：viewer 角色看不到写操作按钮，API 写请求 403（@homurajs/auth + profiles）
 * - 文件上传/下载/删除（@homurajs/storage local-fs + 代理路由）
 * - 授权状态端点经守卫豁免路径始终可读（@homurajs/license）
 */

test.describe('权限与存储', () => {
  test('viewer 角色：写操作按钮隐藏 + API 写请求 403（RBAC 门控）', async ({ page }) => {
    // 注册一个新用户（默认 viewer 角色，无 profile 行）
    const username = `viewer_${uniq()}`
    await page.goto('/login')
    await page.getByRole('tab', { name: '注册' }).click()
    await page.getByLabel('用户名').fill(username)
    await page.getByLabel('密码').fill('viewer@2025')
    await page.getByRole('button', { name: /注册并登录/ }).click()
    await expect(page).toHaveURL(/\/$/)

    // 角色应为 viewer，权限不含 student:write
    const me = await (await page.request.get('/api/users/me')).json()
    expect(me.user.role).toBe('viewer')
    expect(me.user.permissions).not.toContain('student:write')
    expect(me.user.permissions).toContain('student:read')

    // 学员页：可读，但「新建学员」按钮不可见（gated on student:write）
    await page.goto('/students')
    await expect(page.getByRole('heading', { name: '学员管理' })).toBeVisible()
    await expect(page.getByRole('button', { name: /新建学员/ })).toHaveCount(0)

    // 直接打写 API → 403
    const res = await page.request.post('/api/students', {
      data: { name: '越权', studentNo: `HACK${uniq()}` },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  test('文件上传 → 列表可见 → 下载 → 删除（storage 全链路）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: '资料库' })).toBeVisible()

    // 通过 UI 上传（隐藏 input[type=file]）
    const fileName = `e2e-${uniq()}.txt`
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('辰知教务 E2E 上传测试内容\n'),
    })
    await expect(page.getByText(`已上传「${fileName}」`)).toBeVisible()

    // 列表出现该文件（限定在表格内，避开同名 toast 的 strict-mode 冲突）
    await expect(page.locator('table').getByText(fileName)).toBeVisible()

    // 下载：代理路由 /files/<key> 回显内容（经 API 验证，cookie 鉴权）
    const listRes = await (await page.request.get('/api/files?limit=100')).json()
    const uploaded = listRes.items.find((f: any) => f.fileName === fileName)
    expect(uploaded).toBeTruthy()
    const dlRes = await page.request.get(`/files/${uploaded.objectKey}`)
    expect(dlRes.ok()).toBeTruthy()
    expect(await dlRes.text()).toContain('辰知教务 E2E 上传测试内容')

    // 删除
    const delRes = await page.request.delete(`/api/files/${uploaded.id}`)
    expect(delRes.ok()).toBeTruthy()
  })

  test('授权状态端点经守卫豁免路径可读（license）', async ({ page }) => {
    await loginAsAdmin(page)
    // /_license 在 license 守卫豁免清单内，登录态下始终可读
    const res = await page.request.get('/_license')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.status).toBe('active')
    expect(body.signature).toBe('verified')
    expect(Array.isArray(body.features)).toBeTruthy()
    expect(body.features).toContain('student')
  })
})
