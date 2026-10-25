import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: { proxy: {
    '^/(health|qa|character|model|relationships|conversations|archives)(/|$)': {
      target: process.env.VFRIEND_API_ORIGIN || `http://127.0.0.1:${process.env.PORT || 8888}`,
      changeOrigin: true,
    },
  } },
  resolve: { alias: {
    'rp-relationships': fileURLToPath(new URL('../shared/relationships.cjs', import.meta.url)),
    'rp-workflow': fileURLToPath(new URL('../shared/conversationWorkflow.cjs', import.meta.url)),
    'rp-model-settings': fileURLToPath(new URL('../shared/modelSettings.cjs', import.meta.url)),
    'rp-snapshots': fileURLToPath(new URL('../shared/snapshots.cjs', import.meta.url)),
    'rp-session': fileURLToPath(new URL('../shared/chatSession.cjs', import.meta.url)),
    'rp-advisors': fileURLToPath(new URL('../shared/advisors.cjs', import.meta.url)),
    'rp-archives': fileURLToPath(new URL('../shared/archives.cjs', import.meta.url)),
    'rp-core': fileURLToPath(new URL('../shared/runtime.cjs', import.meta.url)),
    'rp-prompt': fileURLToPath(new URL('../shared/prompt.cjs', import.meta.url)),
  } },
  optimizeDeps: { include: ['rp-relationships', 'rp-workflow', 'rp-core', 'rp-prompt', 'rp-archives', 'rp-session', 'rp-advisors', 'rp-snapshots', 'rp-model-settings'] },
  build: {
    commonjsOptions: { include: [/node_modules/, /shared/] },
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
