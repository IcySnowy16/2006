/** Task F7a: the driver's profile and daily trip counter (FR 6.4, 6.10). */
import { DEFAULTS } from '@campus-hop/shared';
import { sgDate } from '../core/clock';

export interface DriverRecord {
  userId: string;
  vehiclePlate: string;
  vehicleModel: string;
  payNowId: string;
  dailyPaidTrips: number;
  /** Singapore date (YYYY-MM-DD) of the last paid trip. A stored date means a missed midnight job can never block a driver. */
  lastPaidTripDate: string | null;
}

export class Driver {
  private constructor(private rec: DriverRecord) {}

  static fromRecord(rec: DriverRecord): Driver {
    return new Driver({ ...rec });
  }

  toRecord(): DriverRecord {
    return { ...this.rec };
  }

  get userId(): string {
    return this.rec.userId;
  }

  /** Trips counted today: a counter left over from an earlier day counts as 0. */
  paidTripsOn(today: string): number {
    return this.rec.lastPaidTripDate === today ? this.rec.dailyPaidTrips : 0;
  }

  /** FR 6.4: true once two paid trips are done today. */
  hasReachedDailyLimit(now: Date): boolean {
    return this.paidTripsOn(sgDate(now)) >= DEFAULTS.MAX_PAID_TRIPS_PER_DAY;
  }

  incrementDailyTrips(now: Date): void {
    const today = sgDate(now);
    this.rec.dailyPaidTrips = this.paidTripsOn(today) + 1;
    this.rec.lastPaidTripDate = today;
  }

  resetDailyTripCounter(): void {
    this.rec.dailyPaidTrips = 0;
  }
}
