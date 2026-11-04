/** Database helpers for integration tests (task K4). */
import { prisma } from '../../src/core/prisma';

/** Every table, children first. `_prisma_migrations` is left alone. */
const TABLES = [
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
  'PickupPoint',
  'CampusLocation',
  'DriverProfile',
  'Wallet',
  'EmailVerification',
  'User',
  'FareTier',
];

/** Empty every table. TRUNCATE does not fire the append-only triggers (they are row triggers). */
export async function resetDb(): Promise<void> {
  await prisma().$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
