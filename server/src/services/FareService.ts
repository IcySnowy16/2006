/**
 * Task C1: fares. The fare per rider depends only on how many riders share the trip (FareTier: 1 rider $3.00, 2 or 3 riders $2.00
 * each). It READS the table and nothing writes it: no surge or demand pricing (NFR-6.1). All arithmetic is in integer cents.
 *
 *  - currentFare   from the riders CONFIRMED now (FR 5.2)
 *  - fareIfJoining what a new rider would pay: confirmed + 1 (shown in matches and the wallet check)
 *  - finalFare     from the riders actually picked up (FR 5.1)
 *  - retier        after a confirm, a cancel or a no-show: recompute every confirmed rider, adjust their holds, emit FareChanged
 */
import type { AppContext } from '../context';
import type { Db, Tx } from '../core/transaction';
import { FareTier } from '../entities/FareTier';
import type { EventQueue } from '../events/bus';
import type { WalletService } from './WalletService';

const PICKED_UP_STATUSES = ['PICKED_UP', 'DROPPED_OFF', 'UNPAID'] as const;

export class FareService {
  constructor(
    private readonly ctx: AppContext,
    private readonly wallets: WalletService,
  ) {}

  /** Per-rider fare for a headcount. 0 or more than 3 riders throws VALIDATION_ERROR. */
  fareForRiders(riders: number): number {
    return FareTier.calculateFare(riders);
  }

  /** Riders who still count toward the headcount: confirmed and not marked no-show. */
  async confirmedRiders(journeyId: string, db: Db = this.ctx.db()): Promise<number> {
    return db.booking.count({ where: { journeyId, status: 'CONFIRMED', pickupStatus: { not: 'NO_SHOW' } } });
  }

  async currentFare(journeyId: string, db: Db = this.ctx.db()): Promise<number> {
    return this.fareForRiders(await this.confirmedRiders(journeyId, db));
  }

  /** What a rider joining now would pay (a seat must exist: the caller checks that). */
  async fareIfJoining(journeyId: string, db: Db = this.ctx.db()): Promise<number> {
    return this.fareForRiders((await this.confirmedRiders(journeyId, db)) + 1);
  }

  /** From the riders picked up, FR 5.1. A trip nobody was picked up on has no fare: the caller must not ask. */
  async finalFare(journeyId: string, db: Db = this.ctx.db()): Promise<number> {
    const riders = await db.booking.count({ where: { journeyId, status: { in: ['CONFIRMED', 'COMPLETED'] }, pickupStatus: { in: [...PICKED_UP_STATUSES] } } });
    return this.fareForRiders(riders);
  }

  /**
   * Recompute the current fare of every confirmed rider after the headcount changed (FR 5.11, UC-21.AC.1). Each hold is moved by
   * the difference and a FareChanged event is queued for each rider whose fare moved (FR 8.4). Returns the new per-rider fare, or
   * null when nobody is confirmed.
   */
  async retier(tx: Tx, queue: EventQueue, journeyId: string): Promise<number | null> {
    const confirmed = await tx.booking.findMany({ where: { journeyId, status: 'CONFIRMED', pickupStatus: { not: 'NO_SHOW' } }, orderBy: { createdAt: 'asc' } });
    if (confirmed.length === 0) return null;
    const fare = this.fareForRiders(confirmed.length);
    for (const b of confirmed) {
      if (b.currentFareCents === fare) continue;
      await tx.booking.update({ where: { id: b.id }, data: { currentFareCents: fare } });
      await this.wallets.adjustHold(tx, b.id, fare);
      queue.push('FareChanged', { bookingId: b.id, passengerId: b.passengerId, oldCents: b.currentFareCents, newCents: fare });
    }
    return fare;
  }

  /**
   * After a no-show or an unpaid rider, the FINAL fare of the riders who were picked up is recomputed from the new headcount
   * (FR 5.1.3). Returns the per-rider final fare, or null when nobody was picked up.
   */
  async finalFareFor(tx: Tx, journeyId: string): Promise<number | null> {
    const riders = await tx.booking.count({ where: { journeyId, status: { in: ['CONFIRMED', 'COMPLETED'] }, pickupStatus: { in: [...PICKED_UP_STATUSES] } } });
    return riders === 0 ? null : this.fareForRiders(riders);
  }
}
