import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

/** Client tests (task K9): React Testing Library in jsdom, with the API mocked by MSW. No server, no database. */
export default defineProject({
  plugins: [react()],
  resolve: { alias: { '@campus-hop/shared': path.resolve(import.meta.dirname, '../shared/src/index.ts') } },
  test: {
    name: 'client',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    globals: false,
    css: false,
    testTimeout: 15_000,
  },
});
