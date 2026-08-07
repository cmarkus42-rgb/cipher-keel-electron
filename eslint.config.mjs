// ESLint 9 Flat Config.
//
// Umfang: src/ und tests/. Beides, weil ein Gate, das die Testsuite auslaesst, falsche
// Sicherheit gibt — gerade no-unused-expressions faengt dort echte Fehler (ein vergessenes
// await, ein Vergleich ohne Wirkung).
//
// Der _-Praefix-Ignore ist Standardkonfiguration, keine Aufweichung: die Adapter in
// src/main/agent/ fuehren absichtlich ungenutzte Parameter, um eine Schnittstelle zu erfuellen.

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
