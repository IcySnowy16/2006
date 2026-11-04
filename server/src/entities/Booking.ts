/**
 * Task F7b: a Booking and its two state machines (B: commercial status, C: the rider's physical progress).
 *
 *   status        PENDING -> CONFIRMED -> COMPLETED;  PENDING | CONFIRMED -> CANCELLED
 *   pickupStatus  WAITING -> APPROACHING -> ARRIVED -> PICKED_UP -> DROPPED_OFF
 *                 ARRIVED -> NO_SHOW;  DROPPED_OFF -> UNPAID (a booked-on-trust shortfall at completion)
 *
 * The driver may mark PICKED_UP from WAITING or APPROACHING too: if the phone's GPS never set ARRIVED, the trip must not be stuck.
 * NO_SHOW is allowed only from ARRIVED (the 3-minute wait is checked by TripService with the Clock).
 */
import type { BookingStatus, PaymentStatus, PickupStatus } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';

export interface BookingRecord {
  id: string;
  journeyId: string;
  passengerId: string;
  hopRequestId: string | null;
  status: BookingStatus;
  pickupStatus: PickupStatus;
  paymentStatus: PaymentStatus | null;
  bookedOnTrust: boolean;
  currentFareCents: number;
  finalFareCents: number | null;
  heldCents: number;
  pickupPointId: string;
  dropoffPointId: string;
  confirmedAt: Date | null;
  arrivedAt: Date | null;
}

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const PICKUP_TRANSITIONS: Record<PickupStatus, readonly PickupStatus[]> = {
  WAITING: ['APPROACHING', 'ARRIVED', 'PICKED_UP'],
  APPROACHING: ['ARRIVED', 'PICKED_UP'],
  ARRIVED: ['PICKED_UP', 'NO_SHOW'],
  PICKED_UP: ['DROPPED_OFF'],
  DROPPED_OFF: ['UNPAID'],
  NO_SHOW: [],
  UNPAID: [],
};

export class Booking {
  private constructor(private rec: BookingRecord) {}

  static fromRecord(rec: BookingRecord): Booking {
    return new Booking({ ...rec });
  }

  toRecord(): BookingRecord {
    return { ...this.rec };
  }

  get id(): string {
    return this.rec.id;
  }
  get status(): BookingStatus {
    return this.rec.status;
  }
  get pickupStatus(): PickupStatus {
    return this.rec.pickupStatus;
  }

  private moveStatus(next: BookingStatus): void {
    if (!BOOKING_TRANSITIONS[this.rec.status].includes(next))
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `A ${this.rec.status} booking cannot become ${next}.` });
    this.rec.status = next;
  }

  /** The driver accepts (UC-10). `heldCents` is what the wallet put on hold for it. */
  confirm(now: Date, heldCents: number, paymentStatus: PaymentStatus): void {
    this.moveStatus('CONFIRMED');
    this.rec.confirmedAt = now;
    this.rec.heldCents = heldCents;
    this.rec.paymentStatus = paymentStatus;
  }

  /** The passenger withdraws, or the driver declines or a job auto-declines (UC-11, UC-10). Refused once the trip is in progress. */
  cancel(): void {
    if (['PICKED_UP', 'DROPPED_OFF', 'NO_SHOW', 'UNPAID'].includes(this.rec.pickupStatus))
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This trip has already started.' });
    this.moveStatus('CANCELLED');
    this.rec.heldCents = 0;
  }

  complete(finalFareCents: number): void {
    this.moveStatus('COMPLETED');
    this.rec.finalFareCents = finalFareCents;
  }

  updatePickupStatus(next: PickupStatus, now: Date): void {
    if (this.rec.status !== 'CONFIRMED' && !(this.rec.status === 'COMPLETED' && next === 'UNPAID')) {
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'Only a confirmed booking has a pickup status.' });
    }
    if (!PICKUP_TRANSITIONS[this.rec.pickupStatus].includes(next))
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `A rider who is ${this.rec.pickupStatus} cannot become ${next}.` });
    this.rec.pickupStatus = next;
    if (next === 'ARRIVED') this.rec.arrivedAt = now;
  }

  /** At completion, a fare that could not be deducted in full (booked on trust, balance too low). */
  markUnpaid(): void {
    if (this.rec.pickupStatus !== 'DROPPED_OFF')
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'Only a rider who was dropped off can be marked unpaid.' });
    this.rec.pickupStatus = 'UNPAID';
    this.rec.paymentStatus = 'UNPAID';
  }

  markPaid(): void {
    this.rec.paymentStatus = 'PAID';
    this.rec.heldCents = 0;
  }

  /** True when nothing more is waiting on this booking before the trip can complete (UC-14.EX.1). */
  isSettled(): boolean {
    return this.rec.status === 'CANCELLED' || ['DROPPED_OFF', 'NO_SHOW', 'UNPAID'].includes(this.rec.pickupStatus);
  }

  updateFare(cents: number): void {
    this.rec.currentFareCents = cents;
  }
}
