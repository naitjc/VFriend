import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: {
    'rp-archives': fileURLToPath(new URL('../shared/archives.cjs', import.meta.url)),
    'rp-core': fileURLToPath(new URL('../shared/runtime.cjs', import.meta.url)),
    'rp-prompt': fileURLToPath(new URL('../shared/prompt.cjs', import.meta.url)),
  } },
  optimizeDeps: { include: ['rp-core', 'rp-prompt', 'rp-archives'] },
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
