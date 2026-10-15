import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * Vitest 配置（单元测试）。
 *
 * 与 Playwright E2E 严格分离：
 * - 单测在 apps/**\/__tests__/*.test.ts（node 环境，直连内存 sqlite）
 * - E2E 在 e2e/*.spec.ts（由 playwright 跑，**排除**，避免被 vitest 误收集）
 */
export default defineConfig({
  resolve: {
    alias: {
      '@guga/shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)),
    },
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    testTimeout: 20_000,
  },
})