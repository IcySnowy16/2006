/** Task F7c: post-trip feedback from one party about the other (FR 9.1, 9.1.1). One per rater per booking (database unique). */
import { AppError } from '../errors/AppError';

export const MAX_COMMENT_LENGTH = 200;

export class Rating {
  constructor(
    readonly bookingId: string,
    readonly raterId: string,
    readonly rateeId: string,
    readonly stars: number,
    readonly comment: string | null,
  ) {}

  /** 1 to 5 whole stars and an optional comment of at most 200 characters. */
  validate(): void {
    const problems: { path: string; message: string }[] = [];
    if (!Number.isInteger(this.stars) || this.stars < 1 || this.stars > 5) problems.push({ path: 'stars', message: 'Choose 1 to 5 stars' });
    if (this.comment !== null && this.comment.length > MAX_COMMENT_LENGTH)
      problems.push({ path: 'comment', message: `At most ${MAX_COMMENT_LENGTH} characters` });
    if (this.raterId === this.rateeId) problems.push({ path: 'rateeId', message: 'You cannot rate yourself' });
    if (problems.length) throw new AppError('VALIDATION_ERROR', { details: problems });
  }
}
