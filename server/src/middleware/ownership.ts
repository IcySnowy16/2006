/** Task F8: check ownership on the SERVER, never trust the client (plan risk 11). */
import { AppError } from '../errors/AppError';

/** Throws FORBIDDEN unless the resource belongs to the user. */
export function assertOwner(resourceOwnerId: string, userId: string, what = 'this'): void {
  if (resourceOwnerId !== userId) throw new AppError('FORBIDDEN', { message: `You cannot use ${what}.` });
}

/** Throws FORBIDDEN unless the user is one of the people the resource belongs to (a trip's driver or one of its passengers). */
export function assertParticipant(participantIds: readonly string[], userId: string): void {
  if (!participantIds.includes(userId)) throw new AppError('FORBIDDEN');
}
