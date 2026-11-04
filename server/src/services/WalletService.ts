/**
 * Task C2: the wallet. Simulated money in integer cents (FR 10.11, NFR-6.4): top up, hold, release, deduct, credit, withdraw.
 *
 * Every money movement is ONE database transaction that locks the wallet row first (`SELECT ... FOR UPDATE`, NFR-3.3/3.4) and
 * writes its ledger row (WalletTransaction, append-only, FR 10.10). The database also refuses a negative balance or a hold above the
 * balance, so a bug here cannot create money.
 *
 * The methods that take a `tx` are called by BookingService, FareService and TripService INSIDE their own transaction, so a hold
 * is applied atomically with the booking change that causes it. The methods without `tx` are the ones the routes call.
 *
 * Hold and "on trust" (UC-7, FR 10.3): when a booking is on trust the passenger cannot cover the whole fare, so the hold takes what
 * IS available (`partial: true`) and the rest is collected at completion or becomes a Debt (C4).
 */
import type { Prisma } from '@prisma/client';
import type { Trip } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { Money } from '../core/money';
import { lockWallet, withTransaction, type Db, type Tx } from '../core/transaction';
import { Wallet } from '../entities/Wallet';
import { AppError } from '../errors/AppError';
import { EventQueue } from '../events/bus';
import { AccountLockService } from './AccountLockService';
import { openDebts, totalOwed } from './debts';

type LedgerType = Prisma.WalletTransactionUncheckedCreateInput['type'];

export type WalletDto = z.infer<typeof Trip.Wallet>;
export type WalletTransactionDto = z.infer<typeof Trip.WalletTransaction>;

export interface Deduction {
  /** What left the passenger's wallet. */
  takenCents: number;
  /** What the passenger could not cover (the fare minus what was taken). */
  shortfallCents: number;
}

export class WalletService {
  constructor(private readonly ctx: AppContext) {}

  // ---------------------------------------------------------------- reading (UC-20 step 1)

  async getWallet(userId: string, db: Db = this.ctx.db()): Promise<WalletDto> {
    const row = await this.findWallet(db, userId);
    const debts = await openDebts(db, userId);
    const owed = totalOwed(debts);
    return {
      balanceCents: row.balanceCents,
      heldCents: row.heldCents,
      availableCents: row.balanceCents - row.heldCents,
      debt: debts.length > 0 ? { amountCents: owed, createdAt: debts[0]!.createdAt.toISOString() } : null,
      simulated: true,
    };
  }

  async transactions(userId: string, limit = 100): Promise<WalletTransactionDto[]> {
    const rows = await this.ctx
      .db()
      .walletTransaction.findMany({ where: { walletUserId: userId }, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: limit });
    return rows.map((r) => ({ id: r.id, type: r.type, amountCents: r.amountCents, bookingId: r.bookingId, timestamp: r.timestamp.toISOString() }));
  }

  // ---------------------------------------------------------------- top up and withdraw (routes)

  /** UC-20. The simulated PayNow adapter is called first; nothing is written if it fails. Then credit + ledger + unlock, in one transaction. */
  async topUp(userId: string, cents: number): Promise<WalletDto> {
    await this.ctx.adapters.payNow.simulateTopUp(userId, cents);
    const queue = new EventQueue();
    await withTransaction(async (tx) => {
      await this.move(tx, userId, 'TOP_UP', cents, null, (w) => w.topUp(Money.cents(cents)));
      await new AccountLockService(this.ctx, this).tryUnlock(tx, queue, userId);
    });
    await this.ctx.bus.publish(queue);
    return this.getWallet(userId);
  }

  /** FR 10.12, simulated. Behind the `withdrawals` flag because the cadence and fees are still open (SRS Q5). */
  async withdraw(userId: string, cents: number): Promise<WalletDto> {
    if (!this.ctx.flags.withdrawals) throw new AppError('NOT_IMPLEMENTED', { message: 'Withdrawals are switched off.' });
    // An unpaid debt is settled from the wallet first (UC-20): money cannot leave while a driver is still owed.
    const user = await this.ctx.db().user.findUniqueOrThrow({ where: { id: userId }, select: { accountStatus: true } });
    if (user.accountStatus === 'LOCKED')
      throw new AppError('ACCOUNT_LOCKED', { message: 'Pay what you owe first: top up, and the debt is settled before you can withdraw.' });
    await this.ctx.adapters.payNow.simulatePayout(userId, cents);
    await withTransaction(async (tx) => {
      await this.move(tx, userId, 'PAYOUT', cents, null, (w) => w.withdraw(Money.cents(cents)));
    });
    return this.getWallet(userId);
  }

  // ---------------------------------------------------------------- inside a caller's transaction

  /**
   * Put the booking's fare aside (UC-21 HOLD). `partial` takes whatever is available when the passenger is booked on trust.
   * Returns how much was actually held.
   */
  async hold(tx: Tx, bookingId: string, cents: number, options: { partial?: boolean } = {}): Promise<number> {
    const booking = await this.loadBooking(tx, bookingId);
    let held = 0;
    await this.change(tx, booking.passengerId, (w) => {
      const amount = options.partial ? Math.min(cents, w.available.cents) : cents;
      if (amount > 0) w.hold(Money.cents(amount)); // throws INSUFFICIENT_BALANCE and rolls the caller's transaction back
      held = amount;
    });
    if (held > 0) {
      await this.ledger(tx, booking.passengerId, 'HOLD', held, bookingId);
      await tx.booking.update({ where: { id: bookingId }, data: { heldCents: { increment: held } } });
    }
    return held;
  }

  /** Give the whole hold back (a cancelled booking). Nothing to do if nothing is held. */
  async release(tx: Tx, bookingId: string): Promise<number> {
    const booking = await this.loadBooking(tx, bookingId);
    await this.releasePart(tx, booking, booking.heldCents);
    return booking.heldCents;
  }

  /** The fare changed (FR 5.11): hold the difference, or release it. A rise is held only as far as the wallet allows. */
  async adjustHold(tx: Tx, bookingId: string, newCents: number): Promise<void> {
    const booking = await this.loadBooking(tx, bookingId);
    const diff = newCents - booking.heldCents;
    if (diff > 0) await this.hold(tx, bookingId, diff, { partial: true });
    else if (diff < 0) await this.releasePart(tx, booking, -diff);
  }

  /**
   * Take the final fare (FR 10.5): first from the hold, then from what else is available. What cannot be covered is returned as
   * `shortfallCents`; the caller (TripService) hands it to AccountLockService. Any hold left over is released.
   */
  async deduct(tx: Tx, bookingId: string, finalCents: number): Promise<Deduction> {
    const booking = await this.loadBooking(tx, bookingId);
    const fromHold = Math.min(booking.heldCents, finalCents);
    let taken = 0;
    await this.change(tx, booking.passengerId, (w) => {
      if (fromHold > 0) w.deduct(Money.cents(fromHold));
      const fromAvailable = Math.min(finalCents - fromHold, w.available.cents);
      if (fromAvailable > 0) w.withdraw(Money.cents(fromAvailable)); // a plain debit of free money
      taken = fromHold + fromAvailable;
    });
    if (taken > 0) await this.ledger(tx, booking.passengerId, 'DEDUCT', taken, bookingId);
    await this.releasePart(tx, booking, booking.heldCents - fromHold); // a fare that went down gives the rest of the hold back
    await tx.booking.update({ where: { id: bookingId }, data: { heldCents: 0 } });
    return { takenCents: taken, shortfallCents: finalCents - taken };
  }

  /** Take money that is free (not held) to pay a Debt (UC-20 step 5). The caller has checked it is there. */
  async takeAvailable(tx: Tx, userId: string, cents: number, bookingId: string): Promise<void> {
    await this.move(tx, userId, 'DEDUCT', cents, bookingId, (w) => w.withdraw(Money.cents(cents)));
  }

  /** The driver's earnings (FR 10.6): added to the DRIVER's wallet. */
  async credit(tx: Tx, userId: string, cents: number, bookingId: string | null): Promise<void> {
    if (cents <= 0) return;
    await this.move(tx, userId, 'CREDIT', cents, bookingId, (w) => w.credit(Money.cents(cents)));
  }

  // ---------------------------------------------------------------- internals

  /**
   * One money movement: change the wallet, then write its ledger line (FR 10.10), in the caller's transaction. Used by every move whose
   * amount is known up front. `hold` and `deduct` work out how much they moved while changing the wallet, so they call the two steps
   * themselves.
   */
  private async move(tx: Tx, userId: string, type: LedgerType, cents: number, bookingId: string | null, rule: (w: Wallet) => void): Promise<void> {
    await this.change(tx, userId, rule);
    await this.ledger(tx, userId, type, cents, bookingId);
  }

  /** Lock the row, run the change on the entity, save the new numbers. The entity enforces the rules; the database re-checks them. */
  private async change(tx: Tx, userId: string, fn: (w: Wallet) => void): Promise<Wallet> {
    await lockWallet(tx, userId);
    const wallet = Wallet.fromRecord(await this.findWallet(tx, userId));
    fn(wallet);
    const next = wallet.toRecord();
    await tx.wallet.update({ where: { userId }, data: { balanceCents: next.balanceCents, heldCents: next.heldCents } });
    return wallet;
  }

  /** The wallet row, or NOT_FOUND. */
  private async findWallet(db: Db, userId: string) {
    const row = await db.wallet.findUnique({ where: { userId } });
    if (!row) throw new AppError('NOT_FOUND', { message: 'This account has no wallet.' });
    return row;
  }

  /** The booking a money move is about. */
  private loadBooking(tx: Tx, bookingId: string) {
    return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  }

  /**
   * Give `cents` of a booking's hold back to its passenger: the wallet, the history line and the booking's own held amount, together.
   * Used by a cancel (all of it), a fare that went down (the difference) and the end of a trip (whatever the final fare left over).
   */
  private async releasePart(tx: Tx, booking: { id: string; passengerId: string }, cents: number): Promise<void> {
    if (cents <= 0) return;
    await this.move(tx, booking.passengerId, 'RELEASE', cents, booking.id, (w) => w.release(Money.cents(cents)));
    await tx.booking.update({ where: { id: booking.id }, data: { heldCents: { decrement: cents } } });
  }

  private ledger(tx: Tx, userId: string, type: LedgerType, amountCents: number, bookingId: string | null) {
    return tx.walletTransaction.create({ data: { walletUserId: userId, type, amountCents, bookingId, timestamp: this.ctx.clock.now() } });
  }
}
