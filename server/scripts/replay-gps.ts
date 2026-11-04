/** Task K7: `npm run replay-gps -- --email ... --password ...`. Plays the driver's stored route over the live-location channel. See src/tools/replay.ts. */
import { readFileSync } from 'node:fs';
import { runReplay } from '../src/tools/replay';

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

async function main() {
  const email = arg('email', 'demo.driver@e.ntu.edu.sg')!;
  const password = arg('password', 'demo-password-1')!;
  const file = arg('path');
  const result = await runReplay({
    baseUrl: arg('url', 'http://localhost:3000')!,
    email,
    password,
    journeyId: arg('journey'),
    path: file ? (JSON.parse(readFileSync(file, 'utf8')) as { lat: number; lng: number }[]) : undefined,
    stepM: Number(arg('step', '25')),
    intervalMs: Number(arg('interval', '2000')),
    log: (l) => console.log(l),
  });
  console.log(`done: ${result.sent} positions sent, ${result.accepted} accepted`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
