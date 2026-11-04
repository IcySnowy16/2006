/** The reconciliation check used by the trip-flow tests must itself be able to fail. */
import { describe, expect, it } from 'vitest';
import { makePassenger } from './helpers';
import { expectLedgerReconcilesWithBalances } from './helpers/ledger';

describe('ledger reconciliation check', () => {
  it('passes for a wallet with no money and no ledger rows', async () => {
    await makePassenger();
    await expectLedgerReconcilesWithBalances();
  });

  it('fails when a balance has no ledger rows behind it (money that appeared from nowhere)', async () => {
    await makePassenger({ balanceCents: 100 }); // the factory writes the balance directly, leaving no TOP_UP row
    await expect(expectLedgerReconcilesWithBalances()).rejects.toThrow(/implied by its ledger/);
  });
});
