import config from '@iobroker/eslint-config'

export default [
  ...config,
  {
    // Global ignores (migriert von .eslintignore und erweitert)
    ignores: [
      'node_modules/**',
      'build/**',
      'admin/build/**',
      'admin/words.js', // von .eslintignore
      'dist/**',
      '*.js.map',
      'coverage/**',
      '.vscode/**',
      '.git/**',
      '**/.eslintrc.js' // von .eslintignore
    ]
  },
  {
    // Angepasste Regeln für eine sanftere Migration
    rules: {
      // Während der Migration: Warnings statt Errors
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',

      // Heizungssteuerung-spezifische Anpassungen
      'no-console': 'off', // Adapter-Logging ist erlaubt
      'max-len': ['warn', { code: 120 }] // Etwas längere Zeilen erlauben
    }
  }
]
