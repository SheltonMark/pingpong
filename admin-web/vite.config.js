import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/admin/',
  build: {
    outDir: '../backend/public/admin',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com',
        changeOrigin: true
      }
    }
  }
})
