import { expect } from 'vitest';
import { prisma } from '../../src/core/prisma';

/**
 * The ledger tells the same story as the balances: for every wallet, balance = top-ups + credits - deductions - payouts, and the
 * hold is never negative or larger than the balance. Only valid when every wallet in the test started at 0 and moved money through
 * the API or the services (the factories that write a balance directly leave no ledger rows).
 */
export async function expectLedgerReconcilesWithBalances(): Promise<void> {
  const wallets = await prisma().wallet.findMany();
  const rows = await prisma().walletTransaction.findMany();
  expect(wallets.length).toBeGreaterThan(0);
  const sign = { TOP_UP: 1, CREDIT: 1, DEDUCT: -1, PAYOUT: -1, HOLD: 0, RELEASE: 0 } as const;
  for (const w of wallets) {
    const implied = rows.filter((r) => r.walletUserId === w.userId).reduce((sum, r) => sum + sign[r.type] * r.amountCents, 0);
    expect(w.balanceCents, `wallet ${w.userId}: balance ${w.balanceCents} vs ${implied} implied by its ledger`).toBe(implied);
    expect(w.heldCents).toBeGreaterThanOrEqual(0);
    expect(w.heldCents).toBeLessThanOrEqual(w.balanceCents);
  }
}
