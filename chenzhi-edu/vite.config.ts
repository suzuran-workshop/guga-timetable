import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * 前端构建配置。
 * - 产物落到 dist/client，正是 @homurajs/app-kit 的 node adapter 的 assetsDir 缺省值，
 *   生产模式下由 createApp({ staticDir }) 直接托管（含 SPA fallback）。
 * - 开发模式下走 Vite dev server + 代理到本地 API（端口见 homura.config.env.example）。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      // 业务 API + 认证 + 文件代理 + 授权状态，全部转发到后端
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/auth': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/files': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/_license': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
