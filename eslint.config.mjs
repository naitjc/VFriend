import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/android/**'] },
  ...vue.configs['flat/base'],
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  { files: ['qa-app/frontend-vue/src/**/*.{js,vue}'], languageOptions: { globals: globals.browser } },
  { files: ['qa-app/backend/**/*.{js,cjs,mjs}', 'qa-app/shared/**/*.cjs', 'qa-app/frontend-vue/*.js', 'scripts/*.mjs'], languageOptions: { globals: globals.node } },
]
