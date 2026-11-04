/**
 * Task C4: lock an account when a fare booked on trust is not paid, and unlock it when the passenger tops up (UC-13.EX.1,
 * UC-20 step 5, FR 10.7 to 10.9).
 *
 * A LOCKED passenger can still log in, see the wallet, top up and cancel; they cannot request or book (FR 10.8, SRS Q6 default).
 * The debt is exactly the shortfall: never negative, never rounded.
 */
import type { AppContext } from '../context';
import type { Tx } from '../core/transaction';
import { Booking, type BookingRecord } from '../entities/Booking';
import { User, type UserRecord } from '../entities/User';
import type { EventQueue } from '../events/bus';
import { openDebts, totalOwed } from './debts';
import type { WalletService } from './WalletService';

export class AccountLockService {
  constructor(
    private readonly ctx: AppContext,
    private readonly wallets: WalletService,
  ) {}

  /** The rider was dropped off but the wallet could not cover `shortfallCents`: record the Debt, lock the user, mark the booking UNPAID. */
  async recordShortfall(tx: Tx, queue: EventQueue, bookingId: string, shortfallCents: number): Promise<void> {
    if (shortfallCents <= 0) return;
    const bookingRow = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const userId = bookingRow.passengerId;

    const booking = Booking.fromRecord(bookingRow as BookingRecord);
    booking.markUnpaid();
    const next = booking.toRecord();
    await tx.booking.update({ where: { id: bookingId }, data: { pickupStatus: next.pickupStatus, paymentStatus: next.paymentStatus } });

    await tx.debt.create({ data: { userId, bookingId, amountCents: shortfallCents, createdAt: this.ctx.clock.now() } });
    await tx.user.update({ where: { id: userId }, data: { unpaidCount: { increment: 1 } } });
    queue.push('DebtRecorded', { userId, bookingId, amountCents: shortfallCents });

    const userRow = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (userRow.accountStatus === 'ACTIVE') await this.setStatus(tx, queue, userRow, 'lock');
  }

  /**
   * Called after every top-up. If the free money now covers everything owed, pay the debt (the driver is credited), clear it and
   * unlock. Equal to the debt is enough (boundary); one cent less is not.
   */
  async tryUnlock(tx: Tx, queue: EventQueue, userId: string): Promise<boolean> {
    const userRow = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (userRow.accountStatus !== 'LOCKED') return false;

    const debts = await openDebts(tx, userId);
    const owed = totalOwed(debts);
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (wallet.balanceCents - wallet.heldCents < owed) return false;

    const now = this.ctx.clock.now();
    for (const d of debts) {
      await this.wallets.takeAvailable(tx, userId, d.amountCents, d.bookingId);
      await this.wallets.credit(tx, d.booking.journey.driverId, d.amountCents, d.bookingId);
      await tx.debt.update({ where: { id: d.id }, data: { clearedAt: now } });
      // The ride is now paid in full: the booking says so (history, booking screen), and it counts as a completed ride for trust.
      await tx.booking.update({ where: { id: d.bookingId }, data: { paymentStatus: 'PAID' } });
    }
    await tx.user.update({ where: { id: userId }, data: { completedRides: { increment: debts.length } } });
    await this.setStatus(tx, queue, userRow, 'unlock');
    return true;
  }

  /** Lock or unlock: the User entity checks the change is allowed, then it is saved and the event is queued. */
  private async setStatus(tx: Tx, queue: EventQueue, userRow: { id: string }, action: 'lock' | 'unlock'): Promise<void> {
    const user = User.fromRecord(userRow as UserRecord);
    if (action === 'lock') user.lock('DEBT');
    else user.unlock();
    await tx.user.update({ where: { id: userRow.id }, data: { accountStatus: user.accountStatus } });
    queue.push(action === 'lock' ? 'AccountLocked' : 'AccountUnlocked', { userId: userRow.id });
  }
}
