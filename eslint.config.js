// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'dist/*',
      'coverage/*',
      'reports/*', // Auto-generated coverage/duplication reports
      '.expo/*',
      'ios/*',
      'android/*',
      'jest.setup.js',
      'cursor-rules/**/*',
      'slop-mop/**/*',
      'node_modules/**/*',
      'artifacts/**/*',
      '**/*.d.ts',
      'e2e/**/*',
      '.venv/**/*',
      'venv/**/*',
      '.git/**/*',
      'build/**/*',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      sonarjs: require('eslint-plugin-sonarjs'),
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    settings: {
      'import/core-modules': ['react-native-maps', 'expo-file-system/legacy'],
    },
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // ===== SONARJS COMPREHENSIVE RULES =====
      // eslint-plugin-sonarjs: cognitive complexity, code smells, bug detection

      // Bug Detection
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-element-overwrite': 'error',
      'sonarjs/no-empty-collection': 'error',
      'sonarjs/no-extra-arguments': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-ignored-return': 'error',
      // no-one-iteration-loop removed in eslint-plugin-sonarjs v3
      'sonarjs/no-use-of-empty-return-value': 'error',
      'sonarjs/non-existent-operator': 'error',

      // Code Smell Detection
      'sonarjs/cognitive-complexity': ['warn', 20],
      'sonarjs/max-switch-cases': ['warn', 30],
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-collection-size-mischeck': 'warn',
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
      'sonarjs/no-duplicated-branches': 'warn',
      'sonarjs/no-gratuitous-expressions': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-inverted-boolean-check': 'warn',
      'sonarjs/no-nested-switch': 'warn',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/no-redundant-boolean': 'warn',
      'sonarjs/no-redundant-jump': 'warn',
      'sonarjs/no-same-line-conditional': 'warn',
      'sonarjs/no-small-switch': 'warn',
      'sonarjs/no-unused-collection': 'warn',
      'sonarjs/no-useless-catch': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/prefer-object-literal': 'warn',
      'sonarjs/prefer-single-boolean-return': 'warn',
      'sonarjs/prefer-while': 'warn',

      // ===== TYPESCRIPT-ESLINT RULES =====
      // Optional chain expressions (typescript:S6582) - requires type info
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // Nullish coalescing preference (typescript:S6606)
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // Unused variables and parameters (typescript:S6767)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: false,
        },
      ],

      // Parameter ordering (typescript:S1788) - doesn't require type info
      '@typescript-eslint/default-param-last': 'error',

      // Union type issues (typescript:S6571)
      '@typescript-eslint/no-redundant-type-constituents': 'warn',

      // Deprecated usage detection (typescript:S1874)
      '@typescript-eslint/no-deprecated': 'warn',

      // Basic TypeScript rules that don't require type information
      '@typescript-eslint/prefer-ts-expect-error': 'warn',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],

      // ===== REACT/JSX RULES =====
      // React/JSX Rules (typescript:S6479 - Array index in keys)
      'react/no-array-index-key': 'error',

      // Additional Code Quality Rules
      complexity: ['warn', 20],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true }],
      'max-params': ['warn', 4],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-alert': 'warn',
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*'],
    plugins: {
      sonarjs: require('eslint-plugin-sonarjs'),
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Include SonarJS rules for test files but with relaxed settings
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
      complexity: 'off',
      'max-lines-per-function': 'off',
      'no-console': 'off',

      // But keep important ones for test quality
      'react/no-array-index-key': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/default-param-last': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-deprecated': 'warn',
    },
  },
];
