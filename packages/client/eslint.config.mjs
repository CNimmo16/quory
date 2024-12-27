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
  ...node
]
