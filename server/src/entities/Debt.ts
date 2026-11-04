/** Task F7c: what a passenger owes after a booked-on-trust ride could not be paid in full (FR 10.7). */
import { AppError } from '../errors/AppError';

export interface DebtRecord {
  id: string;
  userId: string;
  bookingId: string;
  amountCents: number;
  createdAt: Date;
  clearedAt: Date | null;
}

export class Debt {
  private constructor(private rec: DebtRecord) {}

  static fromRecord(rec: DebtRecord): Debt {
    return new Debt({ ...rec });
  }

  toRecord(): DebtRecord {
    return { ...this.rec };
  }

  get amountCents(): number {
    return this.rec.amountCents;
  }

  isOutstanding(): boolean {
    return this.rec.clearedAt === null;
  }

  /** Add a fine on top of the unpaid fare. SRS Q5 default: no fine, so callers normally pass nothing; kept for when the team decides. */
  applyFine(cents: number): void {
    if (!this.isOutstanding()) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This debt is already cleared.' });
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError('A fine is a positive whole number of cents');
    this.rec.amountCents += cents;
  }

  clear(now: Date): void {
    if (!this.isOutstanding()) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This debt is already cleared.' });
    this.rec.clearedAt = now;
  }
}
