/**
 * One test command for the whole repo (task K4): `npm test` runs every project; coverage with `npm run test:coverage`.
 * Projects: shared (contract), server (unit tests, no database), server-db (integration tests, needs Docker), client (React, jsdom).
 * `npm run test:unit` skips the database project.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['shared', 'server', 'server/vitest.db.config.mts', 'client'],
    coverage: {
      provider: 'v8',
      // Globs without a leading folder name: with several projects "shared/src/**" matched nothing and the report said 0 of 0.
      include: ['**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/index.ts',
        '**/server/src/server.ts',
        '**/client/src/main.tsx',
        '**/client/src/mocks/**',
        '**/client/src/test/**',
        '**/*.d.ts',
      ],
      reporter: ['text-summary', 'text'],
      // Measured 91.6 / 82.7 / 89.4 / 94.2 on 19 Oct 2026. Set a little below that: a drop fails the check, normal changes do not.
      thresholds: { statements: 88, branches: 78, functions: 85, lines: 90 },
    },
  },
});
