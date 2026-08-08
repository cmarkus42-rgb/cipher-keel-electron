// ESLint 9 flat config.
//
// Scope: src/ and tests/. Both, because a gate that skips the test suite gives false
// confidence — no-unused-expressions in particular catches real bugs there (a forgotten
// await, a comparison with no effect).
//
// The `_` prefix ignore is standard configuration, not a loosening: the adapters in
// src/main/agent/ deliberately carry unused parameters to satisfy an interface.

import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      '*.config.*',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
)
