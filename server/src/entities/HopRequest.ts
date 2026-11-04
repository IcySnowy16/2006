/** Task F7b: a passenger's request for a hop (UC-7). OPEN until a booking resolves it or its time passes. */
import type { HopRequestStatus } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';

export interface HopRequestRecord {
  id: string;
  passengerId: string;
  fromLocationId: string;
  toLocationId: string;
  requestedTime: Date;
  status: HopRequestStatus;
  expiresAt: Date;
}

export class HopRequest {
  private constructor(private rec: HopRequestRecord) {}

  static fromRecord(rec: HopRequestRecord): HopRequest {
    return new HopRequest({ ...rec });
  }

  toRecord(): HopRequestRecord {
    return { ...this.rec };
  }

  get status(): HopRequestStatus {
    return this.rec.status;
  }

  isOpen(): boolean {
    return this.rec.status === 'OPEN';
  }

  /** A booking was created from this request. */
  resolve(): void {
    if (!this.isOpen()) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This request is no longer open.' });
    this.rec.status = 'MATCHED';
  }

  expire(): void {
    if (!this.isOpen()) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This request is no longer open.' });
    this.rec.status = 'EXPIRED';
  }

  /** Whether a driver going live at `at` may still pick this request up. */
  isStillWanted(at: Date): boolean {
    return this.isOpen() && at.getTime() <= this.rec.expiresAt.getTime();
  }
}
