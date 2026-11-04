/**
 * Task K3: transactions and row locks.
 *
 * Seat counts and wallet balances must never go negative under concurrent requests (NFR-3.1, NFR-3.3). Two tools:
 *  - a CONDITIONAL update (`UPDATE ... WHERE seats > 0`), checking how many rows changed: no read-then-write gap;
 *  - `SELECT ... FOR UPDATE` on the row, when several rows have to be read and changed together.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

/** What services accept: the shared client, or the transaction they were called inside. */
export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/**
 * Run `fn` in one database transaction. If `fn` throws, everything it wrote is rolled back and the error is rethrown.
 * Keep `fn` short: it holds a connection.
 */
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma().$transaction(fn, { maxWait: 5_000, timeout: 20_000 });
}

/** Lock a journey row until the transaction ends. Seats and status are read after this call. */
export async function lockJourney(tx: Tx, journeyId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${journeyId} FOR UPDATE`;
}

/** Lock a wallet row. Lock a passenger's wallet BEFORE the driver's when a settlement touches both, to avoid a deadlock. */
export async function lockWallet(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "userId" FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
}

export async function lockBooking(tx: Tx, bookingId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
}
