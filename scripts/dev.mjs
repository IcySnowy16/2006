// Task K14: `npm run dev` starts everything on a fresh machine, in order, and tells you plainly what is wrong if a step fails.
//   1. Docker is running            2. .env exists (copied from .env.example)
//   3. Postgres + Mailpit are up    4. migrations are applied    5. the fare table is seeded
//   6. the API (with reload) and the web app, with their output labelled
// Set SEED_SYNTHETIC_CATALOG=1 SEED_DEMO_USERS=1 in .env to also load the labelled demo data (docs/SETUP.md).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const say = (m) => console.log(`\n\x1b[36m[dev]\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\n\x1b[31m[dev] ${m}\x1b[0m`);
  process.exit(1);
};
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });

say('1/6 checking Docker');
const docker = spawnSync('docker', ['info'], { cwd: root, stdio: 'ignore', shell: isWin });
if (docker.status !== 0) fail('Docker is not running. Start Docker Desktop (on Windows: wait until it says "Engine running"), then run this again.');

say('2/6 checking .env');
if (!existsSync(path.join(root, '.env'))) {
  copyFileSync(path.join(root, '.env.example'), path.join(root, '.env'));
  console.log('Created .env from .env.example. It works as it is for local development.');
}

say('3/6 starting Postgres and Mailpit');
if (run('docker', ['compose', 'up', '-d', '--wait']).status !== 0)
  fail('docker compose could not start. If port 5433, 1025 or 8025 is taken, change DB_PORT in your environment or stop the other program.');

say('4/6 applying database migrations');
if (run(npm, ['run', 'db:generate']).status !== 0) fail('prisma generate failed (see the message above).');
if (run(npm, ['run', 'db:deploy']).status !== 0) fail('Migrations failed. Is DATABASE_URL in .env pointing at port 5433?');

say('5/6 seeding (fare table; campus data only from a reviewed file)');
if (run(npm, ['run', 'db:seed']).status !== 0) fail('Seeding failed (see the message above).');

say('6/6 starting the API and the web app   (Ctrl+C stops both)');
const children = [
  ['api', ['run', 'dev', '-w', '@campus-hop/server'], '\x1b[35m'],
  ['web', ['run', 'dev', '-w', '@campus-hop/client'], '\x1b[32m'],
].map(([name, args, colour]) => {
  const child = spawn(npm, args, { cwd: root, shell: isWin, stdio: ['ignore', 'pipe', 'pipe'] });
  const label = `${colour}[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, label)));
  child.on('exit', (code) => {
    if (code) console.error(`${label}stopped with code ${code}`);
  });
  return child;
});

console.log(
  '\n  web app   http://localhost:5173\n  API       http://localhost:3000/api/health\n  e-mails   http://localhost:8025   (every e-mail the app sends lands here)\n',
);

const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
