/** Task F7c: one position report of the driver's phone. Constructor only, no mutators: append-only (FR 7.x). */
import { DEFAULTS } from '@campus-hop/shared';

export class LocationUpdate {
  constructor(
    readonly journeyId: string,
    readonly latitude: number,
    readonly longitude: number,
    readonly accuracyM: number,
    readonly timestamp: Date,
  ) {
    Object.freeze(this);
  }

  /** NFR-1.6: worse than 50 m is shown as a low-accuracy indicator. */
  isLowAccuracy(): boolean {
    return this.accuracyM > DEFAULTS.LOW_ACCURACY_M;
  }

  /** NFR-1.5: seconds since this update, for the stale-location indicator (15 s or more). */
  ageSeconds(now: Date): number {
    return Math.max(0, Math.round((now.getTime() - this.timestamp.getTime()) / 1000));
  }
}
