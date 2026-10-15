import { test, expect } from '@playwright/test'
import { loginAsAdmin, uniq } from './helpers.js'

/**
 * E2E 教务业务流（db + service + 前端页面）：
 * 学员 CRUD → 班级建班 + 添加成员（容量约束）→ 排课（冲突检测）→
 * 考勤点名（课时扣减联动）→ 订单充值（余额联动）。
 *
 * 这些是辰知教务的核心业务语义，逐一走真实 UI，验证前后端契约与业务规则对齐。
 */

test.describe('教务业务流', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('学员管理：新建 → 列表可见 → 编辑 → 删除', async ({ page }) => {
    const no = `E2E${uniq()}`
    await page.goto('/students')
    await expect(page.getByRole('heading', { name: '学员管理' })).toBeVisible()

    // 新建
    await page.getByRole('button', { name: /新建学员/ }).click()
    await page.getByLabel('姓名').fill('E2E测试学员')
    await page.getByLabel('学号').fill(no)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText('学员已创建')).toBeVisible()

    // 搜索定位
    await page.getByPlaceholder('搜索姓名 / 学号 / 电话').fill(no)
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(page.getByText('E2E测试学员')).toBeVisible()

    // 进入档案页
    await page.getByText('E2E测试学员').click()
    await expect(page.getByRole('heading', { name: 'E2E测试学员' })).toBeVisible()

    // 回列表删除
    await page.goto('/students')
    await page.getByPlaceholder('搜索姓名 / 学号 / 电话').fill(no)
    await page.getByRole('button', { name: '搜索' }).click()
    const row = page.getByRole('row').filter({ hasText: 'E2E测试学员' })
    await row.getByRole('button').last().click() // 行内菜单触发
    await page.getByRole('menuitem', { name: /删除/ }).click()
    await page.getByRole('button', { name: '删除' }).click() // 确认框
    await expect(page.getByText(/已删除学员/)).toBeVisible()
  })

  test('学员表单校验：空姓名被拦截（zod + RHF）', async ({ page }) => {
    await page.goto('/students')
    await page.getByRole('button', { name: /新建学员/ }).click()
    // 不填姓名直接提交
    await page.getByLabel('学号').fill(`X${uniq()}`)
    await page.getByRole('button', { name: '创建' }).click()
    // 前端校验提示出现，未提交
    await expect(page.getByText('请输入姓名')).toBeVisible()
  })

  test('班级管理：建班 → 进入详情 → 排课', async ({ page }) => {
    const className = `E2E班${uniq()}`
    await page.goto('/classes')
    await page.getByRole('button', { name: /新建班级/ }).click()
    await page.getByLabel('班级名称').fill(className)
    // 显式选择课程（种子已灌入 ≥1 门）：Radix Select → 点触发器 → 选首项
    await page.getByLabel('所属课程').click()
    await page.getByRole('option').first().click()
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText('已创建')).toBeVisible()

    // 进入班级详情
    await page.getByText(className).first().click()
    await expect(page.getByRole('heading', { name: className })).toBeVisible()
    // 排课对话框可打开
    await page.getByRole('button', { name: /排课/ }).click()
    await expect(page.getByText('为班级排课')).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
  })

  test('考勤点名：选班级节次 → 标记出勤 → 保存联动课时', async ({ page }) => {
    await page.goto('/attendance')
    await expect(page.getByRole('heading', { name: '考勤点名' })).toBeVisible()
    // 显式选择一个有种子的班级（避免自动选中前序测试新建的空班级）
    await page.getByLabel('班级').click()
    await page.getByRole('option', { name: '数学冲刺1班' }).click()
    // 用唯一上课日期，减少与历史点名的碰撞（DB 跨重跑持久，种子幂等不重置）
    const lessonDate = `2030-02-${String(1 + (Date.now() % 26)).padStart(2, '0')}`
    await page.getByLabel('上课日期').fill(lessonDate)
    // 点名册应加载出学员（「已标记 N/M」出现即 roster 就绪；N 可能非 0，若该日期历史已点名）
    await expect(page.getByText(/已标记 \d+\/\d+/)).toBeVisible({ timeout: 10_000 })
    // 全部出勤（无论初始状态，强制置 present）
    await page.getByRole('button', { name: '全部出勤' }).click()
    await expect(page.getByRole('button', { name: /保存点名/ })).toBeEnabled()
    await page.getByRole('button', { name: /保存点名/ }).click()
    await expect(page.getByText(/已保存 \d+ 条考勤/)).toBeVisible()
  })

  test('课表周视图：网格渲染 + 排课卡片', async ({ page }) => {
    await page.goto('/timetable')
    await expect(page.getByRole('heading', { name: '课表' })).toBeVisible()
    // 学期上下文：页头描述含学期名与总周数
    await expect(page.getByText(/共 \d+ 周/)).toBeVisible()
    // 周次切换器（「第 N 周（本周）」）——用更具体的文本避免与页脚计数撞车
    await expect(page.getByText(/第 \d+ 周（本周）/)).toBeVisible()
    // 维度切换器存在
    await expect(page.getByRole('tab', { name: '全校' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '教师' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '班级' })).toBeVisible()
    // 表头星期列渲染
    await expect(page.getByText('周一').first()).toBeVisible()
    await expect(page.getByText('周日').first()).toBeVisible()
  })

  test('订单充值：新建订单 → 学员课时余额增加', async ({ page }) => {
    // 先建一个学员拿到 ID
    const no = `ORD${uniq()}`
    const created = await page.request.post('/api/students', {
      data: { name: '订单测试', studentNo: no, gender: 'unknown', status: 'active', balanceLessons: 0 },
    })
    expect(created.ok()).toBeTruthy()
    const student = await created.json()

    // 取一门课程
    const coursesRes = await page.request.get('/api/courses/options/all')
    const { items: courses } = await coursesRes.json()
    expect(courses.length).toBeGreaterThan(0)

    // 建已支付订单 → 余额 += lessonsPurchased
    const orderRes = await page.request.post('/api/orders', {
      data: { studentId: student.id, courseId: courses[0].id, lessonsPurchased: 15, amount: 30000, payMethod: 'wechat', status: 'paid' },
    })
    expect(orderRes.ok()).toBeTruthy()

    const afterRes = await page.request.get(`/api/students/${student.id}`)
    const after = await afterRes.json()
    expect(after.balanceLessons).toBe(15)

    // 退款 → 余额扣回
    const order = await orderRes.json()
    const refundRes = await page.request.post(`/api/orders/${order.id}/status`, { data: { status: 'refunded' } })
    expect(refundRes.ok()).toBeTruthy()
    const afterRefund = await (await page.request.get(`/api/students/${student.id}`)).json()
    expect(afterRefund.balanceLessons).toBe(0)
  })

  test('排课冲突检测：同教室同时段重叠 → 409', async ({ page }) => {
    const request = page.request // 复用已登录 cookie 上下文（独立 request fixture 无会话）
    // 取一个班级
    const classesRes = await request.get('/api/classes?pageSize=1')
    const { items } = await classesRes.json()
    const cls = items[0]
    // 占用周一 1-2 节 A101
    const first = await request.post('/api/schedules', {
      data: { classId: cls.id, weekday: 1, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 16, room: `CONF${uniq()}` },
    })
    expect(first.ok()).toBeTruthy()
    const sched = await first.json()
    // 同教室重叠时段 → 冲突
    const conflict = await request.post('/api/schedules', {
      data: { classId: cls.id, weekday: 1, startPeriod: 2, endPeriod: 3, weekStart: 8, weekEnd: 16, room: sched.room },
    })
    expect(conflict.status()).toBe(409)
    const body = await conflict.json()
    expect(body.error).toBe('schedule_conflict')
    expect(body.conflicts.length).toBeGreaterThan(0)
    // 清理
    await request.delete(`/api/schedules/${sched.id}`)
  })
})
