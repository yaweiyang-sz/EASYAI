import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        ws: true
      },
      '/ai-api': {
        target: 'http://ai-service:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-api/, '/api')
      },
      '/stream': {
        target: 'http://backend:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/stream/, '/api/stream')
      }
    }
  }
})
