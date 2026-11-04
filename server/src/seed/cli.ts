/**
 * Task F6 / Q5: `npm run db:seed` (and `npm run seed:prod`, the compiled copy the Docker image runs).
 *
 *   always              the fare table
 *   if a reviewed file  the campus catalog from prisma/data/campus-catalog.reviewed.json (or SEED_CATALOG_FILE): only places a person marked reviewed
 *   SEED_DEMO_USERS=1   demo people with a known password (never in production)
 *   SEED_SYNTHETIC_CATALOG=1   a made-up "[DEMO]" campus so the app can be tried before the real catalog is reviewed
 *
 * Nothing here invents a coordinate for the real campus.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { findEnvFile } from '../config/env';
import { DEMO_PASSWORD, seedDemoUsers, seedSyntheticCatalog } from './demo';
import { seedCatalogFromFile, seedFareTiers } from './seedCatalog';

export async function main(): Promise<void> {
  const envFile = findEnvFile();
  if (envFile) process.loadEnvFile(envFile);
  if (process.env.NODE_ENV === 'production' && (process.env.SEED_DEMO_USERS === '1' || process.env.SEED_SYNTHETIC_CATALOG === '1')) {
    throw new Error('Refusing to seed demo users or a synthetic catalog with NODE_ENV=production.');
  }
  const db = new PrismaClient();
  try {
    await seedFareTiers(db);
    console.log('fare table: 1 rider $3.00, 2 or 3 riders $2.00 each');

    const file = path.resolve(process.env.SEED_CATALOG_FILE ?? path.join(__dirname, '../../prisma/data/campus-catalog.reviewed.json'));
    if (existsSync(file)) {
      const { seeded, skipped } = await seedCatalogFromFile(db, file);
      console.log(`campus catalog from ${file}: ${seeded.length} places seeded, ${skipped.length} skipped`);
      for (const s of skipped) console.log(`  skipped ${s.name}: ${s.reason}`);
    } else {
      console.log('campus catalog: NOT seeded. There is no reviewed file yet.');
      console.log('  1. npm run geocode -w server        (writes prisma/data/campus-catalog.geocoded.json)');
      console.log('  2. check every place on a map, set "reviewed": true, save it as prisma/data/campus-catalog.reviewed.json');
      console.log('  3. npm run db:seed');
    }

    if (process.env.SEED_SYNTHETIC_CATALOG === '1')
      console.log(`SYNTHETIC catalog: ${await seedSyntheticCatalog(db)} "[DEMO]" places (NOT real NTU coordinates)`);
    if (process.env.SEED_DEMO_USERS === '1') {
      const made = await seedDemoUsers(db);
      console.log(`demo users (password "${DEMO_PASSWORD}"): ${made.join(', ')}`);
    }
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
