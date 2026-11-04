import path from 'node:path';
import { defineProject } from 'vitest/config';

/** Unit tests: no database. `*.int.test.ts` and `*.paths.test.ts` files need Docker and run in the "server-db" project (vitest.db.config.mts). */
export default defineProject({
  resolve: {
    // Tests read the shared contract straight from source, so no build step is needed to test.
    alias: { '@campus-hop/shared': path.resolve(import.meta.dirname, '../shared/src/index.ts') },
  },
  test: {
    name: 'server',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/*.paths.test.ts', '**/node_modules/**'],
    environment: 'node',
  },
});
