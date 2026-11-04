/** Task F7c: one line of the wallet ledger. Constructor only, no mutators: append-only (FR 10.10). */
import type { WalletTxType } from '@campus-hop/shared';
import { Money } from '../core/money';

export class WalletTransaction {
  readonly amount: Money;

  constructor(
    readonly id: string,
    readonly walletUserId: string,
    readonly type: WalletTxType,
    amountCents: number,
    readonly bookingId: string | null,
    readonly timestamp: Date,
  ) {
    this.amount = Money.cents(amountCents);
    Object.freeze(this);
  }
}
