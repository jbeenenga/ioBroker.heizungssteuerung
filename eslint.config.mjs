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
    // Angepasste Regeln für eine sanftere Migration + deine spezifischen Regeln
    rules: {
      // Regeln aus deiner alten .eslintrc.js (angepasst)
      indent: 'off',
      '@typescript-eslint/indent': [
        'error',
        'tab',
        {
          SwitchCase: 1
        }
      ],
      quotes: [
        'error',
        'double',
        {
          avoidEscape: true,
          allowTemplateLiterals: true
        }
      ],
      '@typescript-eslint/no-parameter-properties': 'off',
      '@typescript-eslint/no-explicit-any': 'warn', // warning statt off für Migration
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
          typedefs: false,
          classes: false
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn', // warning statt error für Migration
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true
        }
      ],
      '@typescript-eslint/no-object-literal-type-assertion': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off', // This is necessary for Map.has()/get()!
      'no-var': 'error',
      'prefer-const': 'error',
      'no-trailing-spaces': 'error',

      // Heizungssteuerung-spezifische Anpassungen
      'no-console': 'off', // Adapter-Logging ist erlaubt
      'max-len': ['warn', { code: 120 }] // Etwas längere Zeilen erlauben
    }
  },
  {
    // Test-File-Overrides (aus .eslintrc.js)
    files: ['*.test.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  }
]
