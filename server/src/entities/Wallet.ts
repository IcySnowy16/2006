/**
 * Task F7c: a user's wallet (simulated money). `balance` is what the user has, `held` is the part reserved for confirmed
 * bookings, `available = balance - held`. No operation can leave a balance below 0 or held above balance (NFR-3.3);
 * the database enforces the same with CHECK constraints.
 */
import { DEFAULTS } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';
import { Money } from '../core/money';

export interface WalletRecord {
  userId: string;
  balanceCents: number;
  heldCents: number;
}

export class Wallet {
  private balance: Money;
  private held: Money;

  private constructor(
    readonly userId: string,
    balance: Money,
    held: Money,
  ) {
    if (held.gt(balance)) throw new RangeError('Held money cannot exceed the balance');
    this.balance = balance;
    this.held = held;
  }

  static fromRecord(rec: WalletRecord): Wallet {
    return new Wallet(rec.userId, Money.cents(rec.balanceCents), Money.cents(rec.heldCents));
  }

  toRecord(): WalletRecord {
    return { userId: this.userId, balanceCents: this.balance.cents, heldCents: this.held.cents };
  }

  get balanceMoney(): Money {
    return this.balance;
  }
  get heldMoney(): Money {
    return this.held;
  }
  get available(): Money {
    return this.balance.sub(this.held);
  }

  hasSufficientBalance(amount: Money): boolean {
    return this.available.gte(amount);
  }

  /** Put an amount aside for a confirmed booking. Above what is available: INSUFFICIENT_BALANCE (UC-7.EX.2). */
  hold(amount: Money): void {
    if (!this.hasSufficientBalance(amount)) throw new AppError('INSUFFICIENT_BALANCE');
    this.held = this.held.add(amount);
  }

  /** Give a hold back (a cancelled booking). Releasing more than is held is our bug, not the user's. */
  release(amount: Money): void {
    if (amount.gt(this.held)) throw new Error('Cannot release more than is held');
    this.held = this.held.sub(amount);
  }

  /** Take a held amount for good (the fare at completion). Deducting more than is held is our bug. */
  deduct(amount: Money): void {
    if (amount.gt(this.held)) throw new Error('Cannot deduct more than is held');
    this.held = this.held.sub(amount);
    this.balance = this.balance.sub(amount);
  }

  /** Money arriving: a fare credited to a driver, or a top-up. No cap here; the top-up cap is `topUp`. */
  credit(amount: Money): void {
    this.balance = this.balance.add(amount);
  }

  /** A simulated top-up. The balance may not pass the wallet limit, DEFAULTS.WALLET_CAP_CENTS ($100) (NFR-6.5). */
  topUp(amount: Money): void {
    const after = this.balance.add(amount);
    if (after.cents > DEFAULTS.WALLET_CAP_CENTS) {
      throw new AppError('VALIDATION_ERROR', {
        message: `A wallet cannot hold more than ${Money.cents(DEFAULTS.WALLET_CAP_CENTS).format()}.`,
        details: [{ path: 'amountCents', message: 'Over the wallet limit' }],
      });
    }
    this.balance = after;
  }

  /** A simulated withdrawal to PayNow (FR 10.12): only what is available. */
  withdraw(amount: Money): void {
    if (!this.hasSufficientBalance(amount)) throw new AppError('INSUFFICIENT_BALANCE');
    this.balance = this.balance.sub(amount);
  }
}
