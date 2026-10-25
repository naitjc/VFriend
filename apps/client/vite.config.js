import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: { proxy: {
    '^/(health|qa|character|model|relationships|conversations|archives)(/|$)': {
      target: process.env.VFRIEND_API_ORIGIN || `http://127.0.0.1:${process.env.PORT || 8888}`,
      changeOrigin: true,
    },
  } },
  optimizeDeps: { include: ['@vfriend/core/relationships', '@vfriend/core/workflow', '@vfriend/core/rules', '@vfriend/core/prompt', '@vfriend/core/archives', '@vfriend/core/session', '@vfriend/core/advisors', '@vfriend/core/snapshots', '@vfriend/core/model-settings'] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages\/core/] },
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'pinia'],
          element: ['element-plus', '@element-plus/icons-vue'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
})
