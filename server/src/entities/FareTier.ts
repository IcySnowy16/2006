/**
 * Task F7b: the fare table (FR 5.1): one rider pays $3.00, two or three riders pay $2.00 each.
 * It only READS the table: no setter, no surge pricing (NFR-6.1).
 */
import { DEFAULTS } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';

export class FareTier {
  /** Cents per rider for this many riders. 0 or more than 3 riders is a mistake, not a price. */
  static calculateFare(riders: number): number {
    if (!Number.isInteger(riders) || riders < 1 || riders > DEFAULTS.SHARING_SEAT_CAP) {
      throw new AppError('VALIDATION_ERROR', { message: `A trip carries 1 to ${DEFAULTS.SHARING_SEAT_CAP} riders, got ${riders}.` });
    }
    return riders === 1 ? DEFAULTS.FARE_SOLO_CENTS : DEFAULTS.FARE_SHARED_CENTS;
  }
}
