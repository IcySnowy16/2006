/**
 * Task F7b: the Journey and its state machine (state machine A in the design model).
 *
 *   LIVE -> OPEN -> FULL            a confirmed booking moves it on; a freed seat moves FULL back to OPEN
 *   LIVE / OPEN / FULL -> IN_PROGRESS -> COMPLETED
 *   LIVE / OPEN / FULL -> CANCELLED (DRIVER | GEOFENCE | EXPIRED reason)
 *   LIVE -> EXPIRED                 no booking confirmed within the window (SRS Q7 default: 15 minutes)
 *
 * Every other move throws ILLEGAL_STATE_TRANSITION. The database enforces seats between 0 and 3 as well (migration constraints).
 */
import type { CancelReason, JourneyStatus, Plan } from '@campus-hop/shared';
import { DEFAULTS } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';

export interface JourneyRecord {
  id: string;
  driverId: string;
  presetId: string | null;
  status: JourneyStatus;
  cancelReason: CancelReason | null;
  plan: Plan;
  seatsAvailable: number;
  departureTime: Date;
  liveExpiresAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  outsideReadings: number;
}

/** Which statuses each status may move to. The test walks every pair against this table. */
export const JOURNEY_TRANSITIONS: Record<JourneyStatus, readonly JourneyStatus[]> = {
  LIVE: ['OPEN', 'FULL', 'IN_PROGRESS', 'CANCELLED', 'EXPIRED'],
  OPEN: ['LIVE', 'FULL', 'IN_PROGRESS', 'CANCELLED'],
  FULL: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const capacityFor = (plan: Plan): number => (plan === 'SOLO' ? 1 : DEFAULTS.SHARING_SEAT_CAP);

export class Journey {
  private constructor(private rec: JourneyRecord) {}

  static fromRecord(rec: JourneyRecord): Journey {
    return new Journey({ ...rec });
  }

  toRecord(): JourneyRecord {
    return { ...this.rec };
  }

  get id(): string {
    return this.rec.id;
  }
  get status(): JourneyStatus {
    return this.rec.status;
  }
  get seatsAvailable(): number {
    return this.rec.seatsAvailable;
  }
  get capacity(): number {
    return capacityFor(this.rec.plan);
  }

  canMoveTo(next: JourneyStatus): boolean {
    return JOURNEY_TRANSITIONS[this.rec.status].includes(next);
  }

  private move(next: JourneyStatus): void {
    if (!this.canMoveTo(next)) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `A journey that is ${this.rec.status} cannot become ${next}.` });
    this.rec.status = next;
  }

  /** A driver going live: a new journey starts LIVE with every seat free. */
  goLive(): void {
    if (this.rec.status !== 'LIVE') throw new AppError('ILLEGAL_STATE_TRANSITION');
  }

  /** The first confirmed booking while seats remain. */
  open(): void {
    this.move('OPEN');
  }

  isFull(): boolean {
    return this.rec.seatsAvailable === 0;
  }

  /** A booking is confirmed: one seat fewer. Throws SEAT_UNAVAILABLE at 0 (the database update is conditional as well). */
  decrementSeats(): void {
    if (!['LIVE', 'OPEN', 'FULL'].includes(this.rec.status)) throw new AppError('ILLEGAL_STATE_TRANSITION');
    if (this.rec.seatsAvailable <= 0) throw new AppError('SEAT_UNAVAILABLE');
    this.rec.seatsAvailable -= 1;
    const target: JourneyStatus = this.rec.seatsAvailable === 0 ? 'FULL' : 'OPEN';
    if (this.rec.status !== target) this.move(target);
  }

  /** A confirmed booking is cancelled: a seat is back, and a FULL journey is OPEN again. */
  incrementSeats(): void {
    if (this.rec.seatsAvailable >= this.capacity) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'All seats are already free.' });
    this.rec.seatsAvailable += 1;
    if (this.rec.status === 'FULL') this.move('OPEN');
    // Nobody confirmed any more (before the trip starts): back to LIVE, so the 15-minute window applies again and the sweep can
    // expire it. Otherwise it stayed OPEN for ever: never started, never expired, blocking go-live and the preset (review finding).
    if (this.rec.status === 'OPEN' && this.rec.seatsAvailable === this.capacity) this.move('LIVE');
  }

  /** UC-12: needs at least one CONFIRMED booking. */
  start(confirmedBookings: number, now: Date): void {
    if (confirmedBookings < 1) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'A trip needs at least one confirmed booking to start.' });
    this.move('IN_PROGRESS');
    this.rec.startedAt = now;
  }

  complete(now: Date): void {
    this.move('COMPLETED');
    this.rec.completedAt = now;
  }

  /** Not allowed once the trip is in progress (UC-5 precondition). */
  cancel(reason: CancelReason): void {
    this.move('CANCELLED');
    this.rec.cancelReason = reason;
  }

  /** LIVE with no confirmed booking at the deadline. Recorded as EXPIRED, which is also the cancel reason (FR 3.5). */
  expire(): void {
    this.move('EXPIRED');
    this.rec.cancelReason = 'EXPIRED';
  }

  /** True while the journey may still be cancelled, joined or booked. */
  isOpenForBooking(): boolean {
    return ['LIVE', 'OPEN'].includes(this.rec.status) && this.rec.seatsAvailable > 0;
  }
}
