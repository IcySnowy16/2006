/**
 * Tasks B3 (and B2's wiring): Go Live and Cancel Journey, with every state guard.
 *
 * UC-4 Go Live: the profile is complete (FR 1.6), the browser gave location permission (FR 3.9), the driver has no trip in
 * progress and has not done two paid trips today (FR 6.4), the route is asked from Maps (UC-6) BEFORE anything is written, so a Maps
 * failure leaves no journey behind. The journey starts LIVE with all its seats free and waits LIVE_WINDOW_MIN for a booking (SRS Q7).
 *
 * UC-5 Cancel: allowed while LIVE, OPEN or FULL (FR 3.6). In ONE transaction the journey becomes CANCELLED with its reason, every
 * PENDING or CONFIRMED booking is cancelled and its hold released (FR 3.7); one JourneyCancelled event follows after commit. The
 * geofence and expiry paths call the same method, with no actor, because they have no confirmation step.
 */
import type { CancelReason, Hop } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { addMs, minutes } from '../core/clock';
import { lockJourney, lockUser, withTransaction } from '../core/transaction';
import { Booking, type BookingRecord } from '../entities/Booking';
import { Driver, type DriverRecord } from '../entities/Driver';
import { capacityFor, Journey, type JourneyRecord } from '../entities/Journey';
import { AppError } from '../errors/AppError';
import { EventQueue } from '../events/bus';
import { assertOwner } from '../middleware/ownership';
import { toJourney, type JourneyWithRoute } from './mappers';
import { MatchingService } from './MatchingService';
import { RouteService } from './RouteService';
import { WalletService } from './WalletService';

type GoLiveBody = z.output<typeof Hop.GoLiveBody>;

const ALREADY_ACTIVE = 'You already have a journey that is live or in progress.';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
/** A preset's departure time is used only if it is within this many minutes ahead. Otherwise "go live" means now. */
const SCHEDULE_LOOKAHEAD_MIN = 120;
const SG_OFFSET_MS = 8 * 3_600_000; // Singapore has no daylight saving

export class JourneyService {
  private readonly routes: RouteService;
  private readonly wallets: WalletService;

  constructor(private readonly ctx: AppContext) {
    this.routes = new RouteService(ctx);
    this.wallets = new WalletService(ctx);
  }

  // ---------------------------------------------------------------- UC-4 Go Live

  async goLive(driverId: string, body: GoLiveBody): Promise<z.infer<typeof Hop.Journey>> {
    const db = this.ctx.db();
    if (!body.locationPermission) throw new AppError('LOCATION_PERMISSION_REQUIRED');

    const profile = await db.driverProfile.findUnique({ where: { userId: driverId } });
    if (!profile) throw new AppError('FORBIDDEN', { message: 'Save your vehicle details before you go live.' });

    const preset = await db.driverPreset.findUnique({ where: { id: body.presetId }, include: { exitGate: true } });
    if (!preset) throw new AppError('NOT_FOUND', { message: 'That preset does not exist.' });
    assertOwner(preset.driverId, driverId, 'this preset');

    const now = this.ctx.clock.now();
    if (Driver.fromRecord(profile as DriverRecord).hasReachedDailyLimit(now)) throw new AppError('DAILY_TRIP_LIMIT_REACHED');
    const active = await db.journey.findFirst({ where: { driverId, status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } });
    if (active) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: ALREADY_ACTIVE });
    const riding = await db.booking.findFirst({
      where: { passengerId: driverId, status: { in: ['PENDING', 'CONFIRMED'] }, journey: { status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } },
    });
    if (riding) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'You have a ride booked as a passenger. Finish or cancel it before you drive.' });

    const departure = this.departureFor(now, preset.scheduleDays, preset.scheduleDepartAt);
    const route = await this.routes.calculate(
      { lat: body.position.lat, lng: body.position.lng },
      { lat: preset.exitGate.latitude, lng: preset.exitGate.longitude },
      departure,
    );

    const journeyId = await withTransaction(async (tx) => {
      // Re-check under the user lock that booking also takes, so "go live" and "book a ride" at the same moment cannot both pass
      // (vetting V-2). The checks above stay: they answer fast, before the Maps call.
      await lockUser(tx, driverId);
      const ridingNow = await tx.booking.findFirst({
        where: { passengerId: driverId, status: { in: ['PENDING', 'CONFIRMED'] }, journey: { status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } },
      });
      if (ridingNow)
        throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'You have a ride booked as a passenger. Finish or cancel it before you drive.' });
      const created = await tx.journey.create({
        data: {
          driverId,
          presetId: preset.id,
          plan: preset.plan,
          seatsAvailable: capacityFor(preset.plan),
          departureTime: departure,
          liveExpiresAt: addMs(departure, minutes(this.ctx.config.LIVE_WINDOW_MIN)),
        },
      });
      await this.routes.store(tx, created.id, route);
      return created.id;
    }).catch((err: unknown) => {
      // A parallel "Go live" won the race: the partial unique index Journey_one_active_per_driver refused this insert (G5).
      if ((err as { code?: string }).code === 'P2002') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: ALREADY_ACTIVE });
      throw err;
    });

    // Passengers who asked earlier and match this driver are told (FR 8.11, UC-7.AC.1). A failure here never undoes the go-live.
    try {
      const matching = await new MatchingService(this.ctx).findRequestsFor(journeyId);
      for (const m of matching) await this.ctx.bus.emit('RequestAccepted', { hopRequestId: m.hopRequestId!, passengerId: m.passengerId, journeyId });
    } catch (err) {
      this.ctx.logger.warn({ err: err instanceof Error ? err.message : String(err), journeyId }, 'matching after go-live failed');
    }

    return toJourney(await db.journey.findUniqueOrThrow({ where: { id: journeyId }, include: { route: true } }));
  }

  async mine(driverId: string): Promise<z.infer<typeof Hop.Journey>[]> {
    const rows = await this.ctx.db().journey.findMany({ where: { driverId }, include: { route: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map(toJourney);
  }

  // ---------------------------------------------------------------- UC-5 Cancel Journey

  /** `actorId` is the driver who pressed Cancel; the geofence and expiry paths pass none. */
  async cancel(journeyId: string, reason: CancelReason, actorId?: string): Promise<JourneyWithRoute> {
    const queue = new EventQueue();
    const row = await withTransaction(async (tx) => {
      await lockJourney(tx, journeyId);
      const found = await tx.journey.findUnique({ where: { id: journeyId }, include: { route: true } });
      if (!found) throw new AppError('NOT_FOUND');
      if (actorId) assertOwner(found.driverId, actorId, 'this journey');

      const journey = Journey.fromRecord(found as unknown as JourneyRecord);
      journey.cancel(reason); // ILLEGAL_STATE_TRANSITION once the trip is in progress

      const bookings = await tx.booking.findMany({ where: { journeyId, status: { in: ['PENDING', 'CONFIRMED'] } } });
      for (const b of bookings) {
        await this.wallets.release(tx, b.id);
        const entity = Booking.fromRecord({ ...(b as BookingRecord), heldCents: 0 });
        entity.cancel();
        await tx.booking.update({ where: { id: b.id }, data: { status: entity.status, heldCents: 0 } });
      }
      queue.push('JourneyCancelled', { journeyId, driverId: found.driverId, reason, passengerIds: bookings.map((b) => b.passengerId) });

      return tx.journey.update({ where: { id: journeyId }, data: { status: journey.status, cancelReason: reason }, include: { route: true } });
    });
    await this.ctx.bus.publish(queue);
    return row;
  }

  // ---------------------------------------------------------------- internals

  /**
   * "Now", unless the preset has a schedule for today (Singapore time) whose departure is less than two hours ahead: then that
   * time, so a driver who goes live at 07:40 for an 08:00 preset shows 08:00 to passengers.
   */
  private departureFor(now: Date, days: string[], departAt: string | null): Date {
    if (!departAt || days.length === 0) return now;
    const sg = new Date(now.getTime() + SG_OFFSET_MS);
    if (!days.includes(DAYS[sg.getUTCDay()]!)) return now;
    const [h, m] = departAt.split(':').map(Number);
    const at = new Date(Date.UTC(sg.getUTCFullYear(), sg.getUTCMonth(), sg.getUTCDate(), h, m) - SG_OFFSET_MS);
    const ahead = at.getTime() - now.getTime();
    return ahead > 0 && ahead <= minutes(SCHEDULE_LOOKAHEAD_MIN) ? at : now;
  }
}
