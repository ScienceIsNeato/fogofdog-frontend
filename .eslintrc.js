module.exports = {
  extends: ['eslint-config-expo'],
  plugins: ['sonarjs'],
  rules: {
    // SonarJS Quality Rules (same as SonarCloud!)
    'sonarjs/cognitive-complexity': ['warn', 20],
    'sonarjs/max-switch-cases': ['warn', 30],
    'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
    'sonarjs/no-duplicated-branches': 'warn',
    'sonarjs/no-identical-functions': 'warn',
    'sonarjs/no-redundant-boolean': 'warn',
    'sonarjs/no-unused-collection': 'warn',
    'sonarjs/prefer-immediate-return': 'warn',
    'sonarjs/prefer-object-literal': 'warn',
    'sonarjs/prefer-single-boolean-return': 'warn',
    
    // Code complexity rules  
    'complexity': ['warn', 20],
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true }],
    'max-params': ['warn', 4],
  },
  overrides: [
    {
      files: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*'],
      rules: {
        // Relax rules for test files
        'sonarjs/cognitive-complexity': 'off',
        'sonarjs/no-duplicate-string': 'off',
        'complexity': 'off',
        'max-lines-per-function': 'off',
      },
    },
  ],
}; 