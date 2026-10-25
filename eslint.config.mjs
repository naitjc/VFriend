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
  { files: ['apps/client/src/**/*.{js,vue}'], languageOptions: { globals: globals.browser } },
  { files: ['apps/server/**/*.{js,cjs,mjs}', 'tests/**/*.{js,cjs,mjs}', 'packages/core/**/*.cjs', 'apps/client/*.js', 'scripts/*.mjs'], languageOptions: { globals: globals.node } },
]
