// Task K10: lint rules. Keep them few and useful; Prettier owns formatting.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'lab1/**', 'lab2/**', 'lab3/**', 'client/public/**', '**/*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      // A forgotten debugging line must not reach the server logs (pino is the only logger).
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Scripts and the one-command dev tool talk to the terminal on purpose.
    files: ['scripts/**', 'server/scripts/**', 'server/prisma/seed.ts', 'server/src/seed/cli.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The browser app.
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // A promise nobody awaits loses its error. Needs type information, so it only runs on application code (tests are excluded).
    files: ['server/src/**/*.ts', 'client/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    // Tests may use non-null assertions and `any` for deliberately wrong inputs.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**', 'client/src/test/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off', '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
);
