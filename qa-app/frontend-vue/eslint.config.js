import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/android/**'] },
  ...vue.configs['flat/base'],
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-undef': 'error' },
  },
]
