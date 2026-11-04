import path from 'node:path';
import { defineProject } from 'vitest/config';

/**
 * Integration tests (task K4): real PostgreSQL from docker-compose.yml, database "campushop_test".
 * Migrations are applied once per run (test/db/globalSetup.ts) and every table is emptied before each test (test/db/setup.ts).
 * Files run one at a time because they share one database.
 */
export default defineProject({
  resolve: {
    alias: { '@campus-hop/shared': path.resolve(import.meta.dirname, '../shared/src/index.ts') },
  },
  test: {
    name: 'server-db',
    include: ['src/**/*.int.test.ts', 'src/**/*.paths.test.ts', 'test/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['test/db/globalSetup.ts'],
    setupFiles: ['test/db/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
