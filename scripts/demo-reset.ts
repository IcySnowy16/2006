/**
 * Task Q5: `npm run demo:reset`. Puts the database in the known demo state, every time, in a few seconds:
 *
 *   - everything people made is removed (users, wallets, journeys, bookings, notifications...). The CAMPUS CATALOG and the fare table are kept.
 *   - demo people with a known password; Dana holds BOTH roles and has a vehicle and two presets; Priya can pay, Wei is under $2 and cannot ask,
 *     Sam is under $3 (warning), Lee is LOCKED with a $0.70 debt (see docs/demo-personas.md).
 *   - if the catalog is empty, the labelled [DEMO] synthetic campus is loaded so the scenes can run (it is NOT NTU's real map). If a [DEMO]
 *     campus is already there it is moved to DEMO_GRID_ORIGIN (default: near the middle of NTU), so the places are where you are.
 *
 * Safe to run twice. On a deployed server it needs DEMO_RESET_CONFIRM=yes, because it deletes every user.
 */
import { PrismaClient } from '@prisma/client';
import { findEnvFile } from '../server/src/config/env';
import { DEMO_PASSWORD, demoGridOrigin, seedDemoScenario, seedDemoUsers, seedSyntheticCatalog } from '../server/src/seed/demo';
import { seedFareTiers } from '../server/src/seed/seedCatalog';

const USER_DATA = [
  'Notification',
  'Rating',
  'WalletTransaction',
  'Debt',
  'LocationUpdate',
  'Booking',
  'HopRequest',
  'Route',
  'Journey',
  'DriverPreset',
  'DriverProfile',
  'Wallet',
  'EmailVerification',
  'User',
];

async function main() {
  const envFile = findEnvFile();
  if (envFile) process.loadEnvFile(envFile);
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_RESET_CONFIRM !== 'yes') {
    throw new Error('This deletes every user. On a deployed server run it with DEMO_RESET_CONFIRM=yes.');
  }
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(`TRUNCATE ${USER_DATA.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    await seedFareTiers(db);
    let usedSynthetic = false;
    // An empty catalog gets the [DEMO] places; an existing [DEMO] grid is moved to the current DEMO_GRID_ORIGIN (a real catalog is never touched).
    if ((await db.campusLocation.count()) === 0 || (await db.campusLocation.count({ where: { name: { startsWith: '[DEMO]' } } })) > 0) {
      await seedSyntheticCatalog(db);
      usedSynthetic = true;
    }
    const made = await seedDemoUsers(db);
    const notes = await seedDemoScenario(db);
    console.log(`demo reset done. Everyone's password is "${DEMO_PASSWORD}".`);
    console.log(`  people: ${made.join(', ')}`);
    for (const n of notes) console.log(`  ${n}`);
    if (usedSynthetic) {
      const o = demoGridOrigin();
      console.log(`  NOTE: the labelled [DEMO] synthetic places are in use, with [DEMO] Hall A at ${o.lat}, ${o.lng}. They are NOT the real NTU map.`);
      console.log('  To move them to where you are, put DEMO_GRID_ORIGIN=<latitude>,<longitude> in .env and run this again.');
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
