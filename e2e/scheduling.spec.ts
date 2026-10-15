import { test, expect } from '@playwright/test'
import { loginAsAdmin, uniq } from './helpers.js'

/**
 * E2E 排课增强流（Phase A~D）：
 * - 课表三维度切换（全局/教师/班级）
 * - 学期管理（设置页建学期、设当前）
 * - 调换课（单日课表：停课→状态变更→恢复）
 * - 自动派课（选班级→运行→结果展示）
 */

test.describe('排课增强', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('课表：三维度切换器存在且可切换', async ({ page }) => {
    await page.goto('/timetable')
    await expect(page.getByRole('heading', { name: '课表' })).toBeVisible()
    // 三个维度 tab
    for (const dim of ['全校', '教师', '班级']) {
      await expect(page.getByRole('tab', { name: dim })).toBeVisible()
    }
    // 切到教师维度 → 出现教师选择器（空态提示唯一）
    await page.getByRole('tab', { name: '教师' }).click()
    await expect(page.getByText('请选择教师查看课表')).toBeVisible()
    // 切到班级维度 → 出现班级选择器
    await page.getByRole('tab', { name: '班级' }).click()
    await expect(page.getByText('请选择班级查看课表')).toBeVisible()
  })

  test('课表：教师维度选中后渲染该师课表', async ({ page }) => {
    await page.goto('/timetable')
    await page.getByRole('tab', { name: '教师' }).click()
    await page.getByRole('combobox').first().click()
    await page.getByRole('option').first().click()
    await page.waitForLoadState('networkidle')
    // 网格渲染（节次表头存在）
    await expect(page.getByText('周一').first()).toBeVisible()
    await expect(page.getByText(/第 \d+ 周共 \d+ 节排课/)).toBeVisible()
  })

  /**
   * 教师/班级维度必须**真过滤**，不能只是「渲染了个网格」。
   * 断言方式：UI 显示的节数 == API 按该维度过滤的节数，且与全校节数不同（证明过滤生效）。
   * 再验网格每张卡片的教师名都是所选教师（防止过滤条件没传下去）。
   */
  test('课表：教师/班级维度按维度过滤（节数与 API 地面真相一致）', async ({ page }) => {
    const get = (url: string) => page.request.get(url).then((r) => r.json())
    const ctx = await get('/api/terms/context')
    const week = ctx.currentWeek ?? 1

    const globalItems = (await get(`/api/schedules?week=${week}`)).items
    // 挑一个在该周排课最多的教师，保证过滤后有课可断言
    const byTeacher = new Map<string, { name: string; n: number }>()
    for (const s of globalItems) {
      if (!s.teacherId) continue
      const e = byTeacher.get(s.teacherId) ?? { name: s.teacherName, n: 0 }
      e.n++; byTeacher.set(s.teacherId, e)
    }
    const [teacherId, picked] = [...byTeacher.entries()].sort((a, b) => b[1].n - a[1].n)[0]
    expect(picked, '该周应有带教师的排课').toBeTruthy()

    const teacherItems = (await get(`/api/schedules?week=${week}&teacherId=${teacherId}`)).items
    // 前提：过滤确实减少了结果（全校含多位教师）
    expect(teacherItems.length).toBeGreaterThan(0)
    expect(teacherItems.length).toBeLessThan(globalItems.length)

    await page.goto('/timetable')
    await page.getByRole('tab', { name: '教师' }).click()
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: new RegExp(picked.name) }).first().click()
    await page.waitForLoadState('networkidle')

    // UI 计数 == API 该教师节数（不是全校节数）
    await expect(page.getByText(`第 ${week} 周共 ${teacherItems.length} 节排课`)).toBeVisible()
    // 每张课卡都含所选教师名（卡片 title 形如「课程 · 班级\n节次\n教室 教师」）
    const cards = page.getByTestId('timetable-grid').locator('button[title]')
    await expect(cards).toHaveCount(teacherItems.length)
    for (const t of await cards.evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))) {
      expect(t).toContain(picked.name)
    }

    // 班级维度同理：选一个班，节数应少于全校
    const classId = globalItems[0].classId
    const className = globalItems[0].className
    const classItems = (await get(`/api/schedules?week=${week}&classId=${classId}`)).items
    expect(classItems.length).toBeLessThan(globalItems.length)

    await page.getByRole('tab', { name: '班级' }).click()
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: className }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(`第 ${week} 周共 ${classItems.length} 节排课`)).toBeVisible()
  })

  test('学期管理：设置页学期 tab 可见当前学期', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('tab', { name: /学期管理/ }).click()
    // 种子已建当前学期，表格应出现「当前」徽标
    await expect(page.getByText('2026-2027 学年第一学期')).toBeVisible()
    await expect(page.getByRole('cell', { name: /当前/ }).first()).toBeVisible()
  })

  test('学期管理：新建学期', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('tab', { name: /学期管理/ }).click()
    const name = `E2E学期${uniq()}`
    await page.getByRole('button', { name: /新建学期/ }).click()
    await page.getByLabel('学期名称').fill(name)
    await page.getByLabel(/开始日期/).fill('2027-03-01')
    await page.getByLabel('结束日期').fill('2027-07-15')
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText('已创建')).toBeVisible()
    await expect(page.getByText(name)).toBeVisible()
  })

  /**
   * 已有当前学期时，新建（如下学期计划）不得**静默劫持**时间锚点——
   * 否则课表周次会立刻跳到未来周段，今天的日期解析出教学周范围外。
   * 断言：建完新学期后 /api/terms/context 的 term.id 仍是原来那个。
   */
  test('学期管理：已有当前学期时新建不夺权', async ({ page }) => {
    const get = (url: string) => page.request.get(url).then((r) => r.json())
    const before = await get('/api/terms/context')
    expect(before.term, '前置条件：应存在当前学期').toBeTruthy()

    await page.goto('/settings')
    await page.getByRole('tab', { name: /学期管理/ }).click()
    await page.getByRole('button', { name: /新建学期/ }).click()
    // 「设为当前学期」开关应默认**关闭**（已有当前学期）
    const sw = page.getByLabel('设为当前学期').first()
    await expect(sw).toHaveAttribute('aria-checked', 'false')

    await page.getByLabel('学期名称').fill(`下学期计划${uniq()}`)
    await page.getByLabel(/开始日期/).fill('2027-09-01')
    await page.getByLabel('结束日期').fill('2028-01-20')
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText('已创建')).toBeVisible()

    const after = await get('/api/terms/context')
    expect(after.term.id, '当前学期锚点不得被新建学期夺走').toBe(before.term.id)
    expect(after.currentWeek, '教学周不得跳变').toBe(before.currentWeek)
  })

  test('调换课：单日课表加载 + 停课 + 恢复', async ({ page }) => {
    await page.goto('/schedule-adjust')
    await expect(page.getByRole('heading', { name: '调换课' })).toBeVisible()
    // 取当前学期第 1 周周一（种子在该日有周一排课）——不硬编码日期，从 term context 读
    const ctx = await (await page.request.get('/api/terms/context')).json()
    expect(ctx.term, '应存在当前学期').toBeTruthy()
    const week1Monday: string = ctx.term.startDate
    await page.locator('input[type="date"]').fill(week1Monday)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    // 应至少有一节课（种子周一排课）
    await expect(page.getByText('正常').first()).toBeVisible({ timeout: 8000 })

    // 停课
    await page.getByRole('button', { name: /停课/ }).first().click()
    await expect(page.getByText('已停课').first()).toBeVisible()

    // 恢复
    await page.getByRole('button', { name: /恢复/ }).first().click()
    await expect(page.getByText('已恢复正常排课')).toBeVisible()
  })

  test('自动派课：页面加载 + 班级多选 + 运行展示结果', async ({ page }) => {
    await page.goto('/auto-schedule')
    await expect(page.getByRole('heading', { name: '自动派课' })).toBeVisible()
    // 运行前空态
    await expect(page.getByText(/配置左侧参数后开始派课/)).toBeVisible()
    // 选一个班级
    await page.locator('button[role="checkbox"]').first().click()
    await expect(page.getByRole('button', { name: /开始自动派课/ })).toBeEnabled()
    // 运行
    await page.getByRole('button', { name: /开始自动派课/ }).click()
    // 结果面板出现统计（成功排入/失败/回溯）
    await expect(page.getByText(/成功排入|失败|回溯/).first()).toBeVisible({ timeout: 15000 })
  })
})
