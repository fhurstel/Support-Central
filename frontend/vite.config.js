import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev-only proxy. `autoRewrite` rewrites the host/port of redirect
      // Location headers (e.g. FastAPI's 307 trailing-slash redirect, which
      // points at the absolute backend origin) back to the dev origin, so the
      // browser follows them same-origin and does not strip the Authorization
      // header on a cross-origin redirect. Production serves the SPA and API
      // from one origin via nginx, so this only affects `npm run dev`.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8001',
        changeOrigin: true,
        autoRewrite: true,
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
