import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * 前端构建配置。
 * - 产物落到 ../../dist/client，正是 @homurajs/app-kit 的 node adapter 的 assetsDir 缺省值，
 *   生产模式下由 createApp({ staticDir }) 直接托管（含 SPA fallback）。
 * - 开发模式下走 Vite dev server + 代理到本地 API（端口见 homura.config.env.example）。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@guga/shared': fileURLToPath(new URL('../../packages/shared/src/domain.ts', import.meta.url)),
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: [],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8799', changeOrigin: true },
      '/auth': { target: 'http://127.0.0.1:8799', changeOrigin: true },
      '/files': { target: 'http://127.0.0.1:8799', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8799', changeOrigin: true },
      '/_license': { target: 'http://127.0.0.1:8799', changeOrigin: true },
    },
  },
})