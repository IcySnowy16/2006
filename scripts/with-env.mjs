// Runs a command with the repository's .env loaded (variables already set in the real environment win).
// Prisma looks for .env next to its schema, but ours lives at the repository root, so `npm run db:deploy` goes through this.
//   node ../scripts/with-env.mjs prisma migrate deploy
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

let dir = process.cwd();
for (let i = 0; i < 4; i++) {
  const file = path.join(dir, '.env');
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
  dir = path.dirname(dir);
}
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
process.exit(result.status ?? 1);
