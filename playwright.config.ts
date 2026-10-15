import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置。
 *
 * webServer 会自动拉起：genuine-mock 授权中心（8790）+ 辰知教务 API（8799）。
 * 测试直接打生产形态的 API（8799，dist/client 由 app-kit 静态托管），
 * 走真实浏览器 + 真实 cookie 会话，端到端覆盖六模块。
 *
 * 注意：API 走 dist 构建产物，运行 E2E 前需先 `npm run build`。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 共享同一后端进程与 DB，串行避免数据竞争
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8799',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // 先幂等种子（确保 admin 账号 + 演示数据），再同时拉起授权中心（8790）与业务 API（8799，托管 dist/client）
    command: 'npx tsx scripts/seed.ts && npx concurrently -k "npx tsx tools/genuine-mock.ts" "node dist/server/index.js"',
    url: 'http://127.0.0.1:8799/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      MOCK_STATUS: 'active',
      MOCK_PORT: '8790',
      MOCK_ENFORCEMENT: 'notice',
    },
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
