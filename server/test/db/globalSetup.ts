/** Runs once before the integration tests: apply every migration to the test database. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { TEST_DATABASE_URL } from './testUrl';

export default function setup(): void {
  const prismaCli = require.resolve('prisma/build/index.js');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.resolve(__dirname, '../../prisma/schema.prisma')], {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (err) {
    const out = String((err as { stdout?: Buffer }).stdout ?? '') + String((err as { stderr?: Buffer }).stderr ?? '');
    throw new Error(
      `Could not prepare the test database at ${TEST_DATABASE_URL.replace(/:[^:@/]*@/, ':***@')}.\n` +
        'Is Docker running? Start it with `npm run db:up`, then run the tests again.\n\n' +
        out.slice(-800),
      { cause: err },
    );
  }
}
