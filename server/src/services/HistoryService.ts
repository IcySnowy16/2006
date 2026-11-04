/**
 * Task E1: history (UC-19) and ratings (UC-19 rating flow, FR 9.x).
 *
 * History: the user's past journeys (as driver) and bookings (as passenger), newest first, with the pickup outcome (NO_SHOW and
 * UNPAID included) and the fare / payment outcome. An empty list is a normal answer (UC-19.AC.1).
 *
 * Rating: only on a COMPLETED booking, only by its driver or its passenger, once each (ALREADY_RATED), 1 to 5 stars, a comment of at
 * most 200 characters with control characters removed (it is data, never HTML). The ratee's average is recomputed from their
 * counters, to one decimal place. A passenger who was a no-show cannot be rated and cannot rate.
 */
import type { Trip } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { withTransaction } from '../core/transaction';
import { Rating } from '../entities/Rating';
import { User } from '../entities/User';
import { AppError } from '../errors/AppError';

type HistoryEntry = z.infer<typeof Trip.HistoryEntry>;
type RatingBody = z.output<typeof Trip.RatingBody>;

/** Strip control characters (including newlines inside the comment) and trim. */
// The control characters are exactly what this removes.
export const cleanComment = (s: string): string =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export class HistoryService {
  constructor(private readonly ctx: AppContext) {}

  async list(userId: string): Promise<HistoryEntry[]> {
    const db = this.ctx.db();
    const [journeys, bookings, ratings] = await Promise.all([
      db.journey.findMany({
        where: { driverId: userId, status: { in: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'IN_PROGRESS'] } },
        include: { preset: { include: { exitGate: true } }, bookings: { select: { id: true, status: true, pickupStatus: true, finalFareCents: true } } },
        orderBy: { departureTime: 'desc' },
        take: 100,
      }),
      db.booking.findMany({
        where: { passengerId: userId },
        include: { journey: true, pickupPoint: { include: { location: true } }, dropoffPoint: { include: { location: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.rating.findMany({ where: { raterId: userId }, select: { bookingId: true } }),
    ]);
    const rated = new Set(ratings.map((r) => r.bookingId));
    // What a driver EARNED is what reached their wallet (CREDIT rows): a rider who could not pay in full adds only what was taken,
    // and the rest arrives when their debt is paid. Same number as the Trip Complete screen and the wallet.
    const carriedIds = journeys.flatMap((j) => j.bookings.map((b) => b.id));
    const credits = carriedIds.length
      ? await db.walletTransaction.findMany({
          where: { walletUserId: userId, type: 'CREDIT', bookingId: { in: carriedIds } },
          select: { bookingId: true, amountCents: true },
        })
      : [];
    const creditOf = new Map<string, number>();
    for (const c of credits) if (c.bookingId) creditOf.set(c.bookingId, (creditOf.get(c.bookingId) ?? 0) + c.amountCents);

    const out: (HistoryEntry & { sort: number })[] = [];
    for (const j of journeys) {
      const carried = j.bookings.filter((b) => b.status === 'COMPLETED' && b.pickupStatus !== 'NO_SHOW');
      out.push({
        kind: 'JOURNEY',
        id: j.id,
        date: j.departureTime.toISOString(),
        fromName: 'Campus',
        toName: j.preset?.exitGate.name ?? 'Exit gate',
        status: j.status,
        pickupStatus: null,
        // what the driver earned on this trip
        fareCents: j.status === 'COMPLETED' ? carried.reduce((s, b) => s + (creditOf.get(b.id) ?? 0), 0) : null,
        paymentOutcome: j.status === 'COMPLETED' ? (carried.length > 0 ? 'EARNED' : 'NO_RIDERS') : null,
        canRate: false, // a driver rates each rider from the Trip Complete screen, which has the booking ids
        sort: j.departureTime.getTime(),
      });
    }
    for (const b of bookings) {
      const paid = b.paymentStatus;
      out.push({
        kind: 'BOOKING',
        id: b.id,
        date: b.journey.departureTime.toISOString(),
        fromName: b.pickupPoint.location.name,
        toName: b.dropoffPoint.location.name,
        status: b.status,
        pickupStatus: b.status === 'PENDING' ? null : b.pickupStatus,
        fareCents: b.finalFareCents ?? (b.status === 'CANCELLED' ? null : b.currentFareCents),
        paymentOutcome:
          b.status === 'COMPLETED' ? (b.pickupStatus === 'NO_SHOW' ? 'NO_CHARGE' : paid === 'PAID' ? 'PAID' : paid === 'UNPAID' ? 'UNPAID' : null) : null,
        canRate: b.status === 'COMPLETED' && b.pickupStatus !== 'NO_SHOW' && !rated.has(b.id),
        sort: b.journey.departureTime.getTime(),
      });
    }
    return out.sort((a, b) => b.sort - a.sort).map(({ sort: _sort, ...rest }) => rest);
  }

  async rate(raterId: string, bookingId: string, body: RatingBody): Promise<void> {
    const db = this.ctx.db();
    const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { journey: true } });
    if (!booking) throw new AppError('NOT_FOUND');
    const isPassenger = booking.passengerId === raterId;
    const isDriver = booking.journey.driverId === raterId;
    if (!isPassenger && !isDriver) throw new AppError('FORBIDDEN');
    if (booking.status !== 'COMPLETED') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'You can rate a trip once it is completed.' });
    if (booking.pickupStatus === 'NO_SHOW') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'A no-show trip cannot be rated.' });

    const rateeId = isPassenger ? booking.journey.driverId : booking.passengerId;
    const comment = body.comment ? cleanComment(body.comment) : null;
    new Rating(bookingId, raterId, rateeId, body.stars, comment || null).validate();

    await withTransaction(async (tx) => {
      if (await tx.rating.findUnique({ where: { bookingId_raterId: { bookingId, raterId } } })) throw new AppError('ALREADY_RATED');
      try {
        await tx.rating.create({ data: { bookingId, raterId, rateeId, stars: body.stars, comment: comment || null, timestamp: this.ctx.clock.now() } });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') throw new AppError('ALREADY_RATED'); // two requests at once: the unique index decides
        throw err;
      }
      const ratee = await tx.user.findUniqueOrThrow({ where: { id: rateeId } });
      const user = User.fromRecord(ratee);
      user.recordRating(body.stars);
      const next = user.toRecord();
      await tx.user.update({ where: { id: rateeId }, data: { ratingSum: next.ratingSum, ratingCount: next.ratingCount } });
    });
  }

  /** FR 9.6: how many of this user's rides ended UNPAID. Shown on request cards and booking detail as a payment-history indicator. */
  async paymentHistoryIndicator(userId: string): Promise<{ unpaidCount: number; label: 'GOOD' | 'WATCH' }> {
    const user = await this.ctx.db().user.findUniqueOrThrow({ where: { id: userId }, select: { unpaidCount: true } });
    return { unpaidCount: user.unpaidCount, label: user.unpaidCount === 0 ? 'GOOD' : 'WATCH' };
  }
}
