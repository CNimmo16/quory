import base from '@quory/config/eslint/base'
import node from '@quory/config/eslint/node'
import react from '@quory/config/eslint/react'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['out']
  },
  ...base,
  ...react,
  ...node,
  {
    // Packaging hooks run as CommonJS (including electron-builder's signing hook).
    files: ['scripts/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
]
