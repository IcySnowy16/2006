/**
 * Task B5a: Request Hop (UC-7): post, stay open, expire.
 *
 *  - both places must exist (FR 4.1.1, 4.1.2); the time is now or later TODAY (SRS Q8 default; a past time is a VALIDATION_ERROR, FR 4.1.3);
 *  - only an ACTIVE passenger may ask: LOCKED gets ACCOUNT_LOCKED (UC-7.EX.1; the route also has the requireUnlocked middleware);
 *  - one OPEN request per passenger at a time (stops spam), CONFLICT otherwise;
 *  - with no match the request stays OPEN for the matching window and is offered to drivers who go live (UC-7.AC.1, FR 4.10);
 *  - after its window it becomes EXPIRED. Past-due requests are also expired lazily when their owner asks, so the sweep job (D4)
 *    is a tidy-up and a missed run never blocks anybody.
 *
 * Feature flag `scheduledRequests` off: only "now" is accepted.
 */
import type { Hop } from '@campus-hop/shared';
import { DEFAULTS } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { addMs, minutes, sgDate } from '../core/clock';
import { Money } from '../core/money';
import { AppError } from '../errors/AppError';
import { assertOwner } from '../middleware/ownership';
import { toHopRequest } from './mappers';
import { MatchingService } from './MatchingService';

type Body = z.output<typeof Hop.HopRequestBody>;
/** A phone's clock may be a few seconds behind ours; a "now" typed a moment ago is not in the past. */
const CLOCK_GRACE_MS = 60_000;

export class HopRequestService {
  private readonly matching: MatchingService;

  constructor(private readonly ctx: AppContext) {
    this.matching = new MatchingService(ctx);
  }

  async create(passengerId: string, body: Body): Promise<{ hopRequest: z.infer<typeof Hop.HopRequest>; matches: z.infer<typeof Hop.Match>[] }> {
    const db = this.ctx.db();
    const now = this.ctx.clock.now();

    const user = await db.user.findUniqueOrThrow({ where: { id: passengerId } });
    if (user.accountStatus === 'LOCKED') throw new AppError('ACCOUNT_LOCKED');
    // Not a lock: the account stays ACTIVE (it can still cancel, top up and look around), it just cannot ask for a ride it could not pay for.
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: passengerId } });
    if (wallet.balanceCents - wallet.heldCents < DEFAULTS.MIN_BALANCE_TO_RIDE_CENTS)
      throw new AppError('INSUFFICIENT_BALANCE', {
        message: `Top up to at least ${Money.cents(DEFAULTS.MIN_BALANCE_TO_RIDE_CENTS).format()} to ask for a ride.`,
      });
    const driving = await db.journey.findFirst({ where: { driverId: passengerId, status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } });
    if (driving)
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'You have a journey live as a driver. Finish or cancel it before you ask for a ride.' });

    const [from, to] = await Promise.all([
      db.campusLocation.findUnique({ where: { id: body.fromLocationId } }),
      db.campusLocation.findUnique({ where: { id: body.toLocationId } }),
    ]);
    if (!from || !to) throw new AppError('NOT_FOUND', { message: 'One of those places does not exist.' });

    const requestedTime = body.requestedTime ? new Date(body.requestedTime) : now;
    this.checkTime(requestedTime, now);

    await this.expireDueFor(passengerId);
    if ((await db.hopRequest.count({ where: { passengerId, status: 'OPEN' } })) > 0) {
      throw new AppError('CONFLICT', { message: 'You already have an open request. Cancel it or wait for it to end.' });
    }

    const row = await db.hopRequest.create({
      data: {
        passengerId,
        fromLocationId: from.id,
        toLocationId: to.id,
        requestedTime,
        expiresAt: addMs(requestedTime, minutes(DEFAULTS.MATCH_TIME_TOLERANCE_MIN)),
      },
    });
    const matches = await this.matching.findJourneysFor(row);
    return { hopRequest: toHopRequest(row), matches };
  }

  async mine(passengerId: string): Promise<z.infer<typeof Hop.HopRequest>[]> {
    await this.expireDueFor(passengerId);
    const rows = await this.ctx.db().hopRequest.findMany({ where: { passengerId, status: 'OPEN' }, orderBy: { requestedTime: 'asc' } });
    return rows.map(toHopRequest);
  }

  /** Withdraw an OPEN request. A MATCHED one is withdrawn by cancelling its booking instead. */
  async cancel(passengerId: string, id: string): Promise<z.infer<typeof Hop.HopRequest>> {
    const db = this.ctx.db();
    const row = await db.hopRequest.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    assertOwner(row.passengerId, passengerId, 'this request');
    // Conditional update: a request matched or expired a moment ago is not overwritten.
    const done = await db.hopRequest.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'CANCELLED' } });
    if (done.count === 0) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `This request is already ${row.status.toLowerCase()}.` });
    return toHopRequest(await db.hopRequest.findUniqueOrThrow({ where: { id } }));
  }

  /** The sweep (D4): every OPEN request whose window has passed becomes EXPIRED. Returns how many. */
  async expireDue(): Promise<number> {
    const result = await this.ctx
      .db()
      .hopRequest.updateMany({ where: { status: 'OPEN', expiresAt: { lt: this.ctx.clock.now() } }, data: { status: 'EXPIRED' } });
    return result.count;
  }

  private async expireDueFor(passengerId: string): Promise<void> {
    await this.ctx.db().hopRequest.updateMany({ where: { passengerId, status: 'OPEN', expiresAt: { lt: this.ctx.clock.now() } }, data: { status: 'EXPIRED' } });
  }

  private checkTime(requestedTime: Date, now: Date): void {
    // The reason goes in the message too: the screen shows the message, not the details.
    const fail = (message: string) => new AppError('VALIDATION_ERROR', { message: `${message}.`, details: [{ path: 'requestedTime', message }] });
    if (requestedTime.getTime() < now.getTime() - CLOCK_GRACE_MS) throw fail('Choose a time that has not passed');
    if (sgDate(requestedTime) !== sgDate(now)) throw fail('Requests are for today only');
    if (!this.ctx.flags.scheduledRequests && requestedTime.getTime() > now.getTime() + CLOCK_GRACE_MS)
      throw fail('Requests for later are switched off; ask for now');
  }
}
