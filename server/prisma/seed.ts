// `prisma db seed` and `npm run db:seed` start here; the code is in src/seed/cli.ts so the production build contains it too.
import { main } from '../src/seed/cli';

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
