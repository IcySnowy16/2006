/**
 * Task C4: reading what a user owes. Its own file because both WalletService (the wallet shows the debt) and AccountLockService (a
 * top-up settles it) need it; kept apart, neither has to import the other for these two helpers.
 */
import type { Db } from '../core/transaction';

/** A user's unpaid debts, oldest first, with the journey whose driver is owed. */
export function openDebts(db: Db, userId: string) {
  return db.debt.findMany({ where: { userId, clearedAt: null }, include: { booking: { include: { journey: true } } }, orderBy: { createdAt: 'asc' } });
}

/** What those debts add up to, in cents. */
export const totalOwed = (debts: readonly { amountCents: number }[]): number => debts.reduce((sum, d) => sum + d.amountCents, 0);
