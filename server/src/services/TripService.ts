/**
 * Task D1: Start Trip, the pickup transitions, Complete Trip with safe settlement, and the contact route.
 *
 *   UC-12 start      gates in this order: departure time reached, at least one CONFIRMED booking, fewer than 2 paid trips today,
 *                    location permission, a fresh GPS fix. Unanswered requests are declined; the geofence stops by itself because
 *                    it only watches LIVE / OPEN / FULL journeys.
 *   UC-13 pickups    the driver marks PICKED_UP, DROPPED_OFF, NO_SHOW (only from ARRIVED, and only 3 minutes after ARRIVED by the
 *                    Clock). The system sets APPROACHING / ARRIVED from the location stream (D2).
 *   UC-14 complete   ONE transaction: every confirmed booking must be dropped off, no-show or unpaid (UNRESOLVED_BOOKINGS); final fare
 *                    from the riders actually carried; each rider's held fare is deducted and the driver's wallet credited; a
 *                    booked-on-trust shortfall becomes a Debt and locks the account (C4). Any failure rolls everything back, and a
 *                    second call is ILLEGAL_STATE_TRANSITION, never a second charge.
 *   UC-15 contact    the other party's first name and phone number, to a confirmed participant only, inside the contact window.
 *
 * Every time check uses the Clock. The phone number is never put in a log object.
 */
import { DEFAULTS, type DriverPickupAction, type PickupStatus, type Trip } from '@campus-hop/shared';
import type { Position } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { addMs, minutes } from '../core/clock';
import { lockJourney, withTransaction } from '../core/transaction';
import { Booking, type BookingRecord } from '../entities/Booking';
import { Driver, type DriverRecord } from '../entities/Driver';
import { Journey, type JourneyRecord } from '../entities/Journey';
import { User, type UserRecord } from '../entities/User';
import { AppError } from '../errors/AppError';
import { EventQueue } from '../events/bus';
import { assertOwner } from '../middleware/ownership';
import { AccountLockService } from './AccountLockService';
import { FareService } from './FareService';
import { toJourney } from './mappers';
import { WalletService } from './WalletService';

type Contact = z.infer<typeof Trip.Contact>;
type StartBody = z.output<typeof Trip.StartTripBody>;

/** A position older than this (or from the future) is not a "fix": UC-12.EX.3. */
const FIX_MAX_AGE_MS = 60_000;

export class TripService {
  private readonly wallets: WalletService;
  private readonly fares: FareService;
  private readonly locks: AccountLockService;

  constructor(private readonly ctx: AppContext) {
    this.wallets = new WalletService(ctx);
    this.fares = new FareService(ctx, this.wallets);
    this.locks = new AccountLockService(ctx, this.wallets);
  }

  // ---------------------------------------------------------------- UC-12 start

  async start(driverId: string, journeyId: string, body: StartBody) {
    const queue = new EventQueue();
    const now = this.ctx.clock.now();
    const row = await withTransaction(async (tx) => {
      await lockJourney(tx, journeyId);
      const found = await tx.journey.findUnique({ where: { id: journeyId } });
      if (!found) throw new AppError('NOT_FOUND');
      assertOwner(found.driverId, driverId, 'this journey');
      if (!['LIVE', 'OPEN', 'FULL'].includes(found.status))
        throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `A journey that is ${found.status} cannot be started.` });

      // 1. departure time reached (by the Clock)
      if (now.getTime() < found.departureTime.getTime()) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'It is not yet the departure time.' });
      // 2. at least one confirmed booking
      const confirmed = await tx.booking.findMany({ where: { journeyId, status: 'CONFIRMED' } });
      if (confirmed.length < 1) throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'A trip needs at least one confirmed booking to start.' });
      // 3. fewer than two paid trips today
      const profile = await tx.driverProfile.findUnique({ where: { userId: driverId } });
      if (!profile) throw new AppError('FORBIDDEN', { message: 'Save your vehicle details first.' });
      if (Driver.fromRecord(profile as DriverRecord).hasReachedDailyLimit(now)) throw new AppError('DAILY_TRIP_LIMIT_REACHED');
      // 4. location permission, 5. a fresh fix
      if (!body.locationPermission) throw new AppError('LOCATION_PERMISSION_REQUIRED');
      if (!this.isFreshFix(body.position, now))
        throw new AppError('LOCATION_PERMISSION_REQUIRED', { message: 'Your phone has not reported a location yet. Wait for a GPS fix and try again.' });

      const journey = Journey.fromRecord(found as unknown as JourneyRecord);
      journey.start(confirmed.length, now);
      await tx.journey.update({ where: { id: journeyId }, data: { status: journey.status, startedAt: now, outsideReadings: 0 } });
      await tx.locationUpdate.create({
        data: {
          journeyId,
          latitude: body.position.lat,
          longitude: body.position.lng,
          accuracyM: body.position.accuracyM,
          timestamp: new Date(body.position.ts),
        },
      });

      // Requests nobody answered before the start are declined (FR 5.5).
      for (const p of await tx.booking.findMany({ where: { journeyId, status: 'PENDING' } })) {
        await tx.booking.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
        queue.push('BookingDeclined', { bookingId: p.id, journeyId, driverId, passengerId: p.passengerId, automatic: true });
      }
      queue.push('TripStarted', { journeyId, driverId, passengerIds: confirmed.map((b) => b.passengerId) });
      return tx.journey.findUniqueOrThrow({ where: { id: journeyId }, include: { route: true } });
    });
    await this.ctx.bus.publish(queue);
    return toJourney(row);
  }

  // ---------------------------------------------------------------- UC-13 pickups

  /** The driver's buttons. PICKED_UP and DROPPED_OFF move the rider on; NO_SHOW also frees the seat and re-tiers the others. */
  async updatePickupStatus(driverId: string, bookingId: string, next: DriverPickupAction) {
    const first = await this.ctx.db().booking.findUnique({ where: { id: bookingId }, include: { journey: true } });
    if (!first) throw new AppError('NOT_FOUND');
    assertOwner(first.journey.driverId, driverId, 'this booking');
    return this.applyPickupStatus(bookingId, first.journeyId, next);
  }

  /** The location stream (D2) sets APPROACHING and ARRIVED; nobody else may. */
  async systemPickupStatus(bookingId: string, next: 'APPROACHING' | 'ARRIVED', distanceM: number | null, etaSec: number | null) {
    const first = await this.ctx.db().booking.findUnique({ where: { id: bookingId } });
    if (!first) throw new AppError('NOT_FOUND');
    return this.applyPickupStatus(bookingId, first.journeyId, next, { distanceM, etaSec });
  }

  private async applyPickupStatus(
    bookingId: string,
    journeyId: string,
    next: PickupStatus,
    extra: { distanceM: number | null; etaSec: number | null } = { distanceM: null, etaSec: null },
  ) {
    const queue = new EventQueue();
    const now = this.ctx.clock.now();
    const row = await withTransaction(async (tx) => {
      await lockJourney(tx, journeyId);
      const jrow = await tx.journey.findUniqueOrThrow({ where: { id: journeyId } });
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (jrow.status !== 'IN_PROGRESS') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'The trip is not in progress.' });
      const booking = Booking.fromRecord(current as BookingRecord);

      if (next === 'NO_SHOW') {
        const arrivedAt = current.arrivedAt;
        if (current.pickupStatus !== 'ARRIVED' || !arrivedAt)
          throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'A rider can be marked no-show only after you have arrived at the pickup point.' });
        if (now.getTime() < addMs(arrivedAt, minutes(DEFAULTS.NO_SHOW_WAIT_MIN)).getTime())
          throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `Wait ${DEFAULTS.NO_SHOW_WAIT_MIN} minutes after arriving before marking a no-show.` });
      }
      booking.updatePickupStatus(next, now); // ILLEGAL_STATE_TRANSITION for any move the state machine does not allow
      await tx.booking.update({ where: { id: bookingId }, data: { pickupStatus: next, ...(next === 'ARRIVED' ? { arrivedAt: now } : {}) } });

      if (next === 'NO_SHOW') {
        await this.wallets.release(tx, bookingId); // FR 6.8: the hold is given back
        const journey = Journey.fromRecord(jrow as unknown as JourneyRecord);
        journey.incrementSeats();
        await tx.journey.update({ where: { id: journeyId }, data: { seatsAvailable: journey.seatsAvailable } });
        await this.fares.retier(tx, queue, journeyId); // FR 5.1.3: the riders left pay by the new headcount
      }
      queue.push('PickupStatusChanged', {
        bookingId,
        journeyId,
        passengerId: current.passengerId,
        driverId: jrow.driverId,
        status: next,
        distanceM: extra.distanceM,
        etaSec: extra.etaSec,
      });
      return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    });
    await this.ctx.bus.publish(queue);
    return row;
  }

  // ---------------------------------------------------------------- UC-14 complete

  async complete(driverId: string, journeyId: string) {
    const queue = new EventQueue();
    const now = this.ctx.clock.now();
    const row = await withTransaction(async (tx) => {
      await lockJourney(tx, journeyId);
      const jrow = await tx.journey.findUnique({ where: { id: journeyId } });
      if (!jrow) throw new AppError('NOT_FOUND');
      assertOwner(jrow.driverId, driverId, 'this journey');
      if (jrow.status !== 'IN_PROGRESS') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'Only a trip in progress can be completed.' }); // also the second call of a retry

      const confirmed = await tx.booking.findMany({ where: { journeyId, status: 'CONFIRMED' }, orderBy: { passengerId: 'asc' } });
      if (confirmed.some((b) => !Booking.fromRecord(b as BookingRecord).isSettled())) throw new AppError('UNRESOLVED_BOOKINGS'); // FR 6.2
      const carried = confirmed.filter((b) => b.pickupStatus === 'DROPPED_OFF');
      const fare = await this.fares.finalFareFor(tx, journeyId); // null when nobody was carried
      const takenBy: { bookingId: string; cents: number }[] = [];
      const unpaid: { bookingId: string; passengerId: string; shortfall: number }[] = [];

      // Passenger wallets are locked in a fixed order, THEN the driver's, so a settlement and a top-up can never deadlock.
      for (const b of carried) {
        const charge = this.fares.lockedFare(fare!, b.currentFareCents); // never above the agreed fare when fareLock is on (F2)
        const result = await this.wallets.deduct(tx, b.id, charge);
        takenBy.push({ bookingId: b.id, cents: result.takenCents });
        await tx.booking.update({
          where: { id: b.id },
          data: { status: 'COMPLETED', finalFareCents: charge, paymentStatus: result.shortfallCents === 0 ? 'PAID' : 'UNPAID' },
        });
        if (result.shortfallCents > 0) unpaid.push({ bookingId: b.id, passengerId: b.passengerId, shortfall: result.shortfallCents });
        else await tx.user.update({ where: { id: b.passengerId }, data: { completedRides: { increment: 1 } } });
      }
      for (const t of takenBy) await this.wallets.credit(tx, jrow.driverId, t.cents, t.bookingId); // money moves user to user (13 Oct decision)
      for (const u of unpaid) await this.locks.recordShortfall(tx, queue, u.bookingId, u.shortfall);

      for (const b of confirmed.filter((c) => c.pickupStatus === 'NO_SHOW')) {
        await tx.booking.update({ where: { id: b.id }, data: { status: 'COMPLETED', finalFareCents: 0 } });
      }

      const journey = Journey.fromRecord(jrow as unknown as JourneyRecord);
      journey.complete(now);
      await tx.journey.update({ where: { id: journeyId }, data: { status: journey.status, completedAt: now } });

      if (carried.length > 0) {
        const profile = await tx.driverProfile.findUniqueOrThrow({ where: { userId: jrow.driverId } });
        const driver = Driver.fromRecord(profile as DriverRecord);
        driver.incrementDailyTrips(now); // FR 6.10: a trip with paying riders counts toward the two a day
        const next = driver.toRecord();
        await tx.driverProfile.update({
          where: { userId: jrow.driverId },
          data: { dailyPaidTrips: next.dailyPaidTrips, lastPaidTripDate: next.lastPaidTripDate },
        });
      }
      queue.push('TripCompleted', { journeyId, driverId: jrow.driverId, passengerIds: confirmed.map((b) => b.passengerId) });
      return tx.journey.findUniqueOrThrow({ where: { id: journeyId }, include: { route: true } });
    });
    await this.ctx.bus.publish(queue);
    return toJourney(row);
  }

  // ---------------------------------------------------------------- UC-15 contact by phone

  /**
   * The other party's first name and number (UC-15 alternative flow AC.2). Anything that is not a confirmed participant inside the
   * contact window gets the SAME FORBIDDEN, so the answer does not reveal whether the booking exists (EX.3, EX.4). The number is
   * not logged; only who asked and about which booking.
   */
  async getContact(viewerId: string, bookingId: string): Promise<Contact> {
    const refuse = () => new AppError('FORBIDDEN', { message: 'You cannot see contact details for this trip.' });
    if (!this.ctx.flags.contactCall) throw refuse();
    const row = await this.ctx.db().booking.findUnique({ where: { id: bookingId }, include: { journey: { include: { driver: true } }, passenger: true } });
    if (!row) throw refuse();
    const isPassenger = row.passengerId === viewerId;
    const isDriver = row.journey.driverId === viewerId;
    if (!isPassenger && !isDriver) throw refuse();
    if (row.status !== 'CONFIRMED' && row.status !== 'COMPLETED') throw refuse();
    if (row.status === 'COMPLETED' && ['NO_SHOW'].includes(row.pickupStatus)) throw refuse();
    if (['CANCELLED', 'EXPIRED'].includes(row.journey.status)) throw refuse();
    const ended = row.journey.completedAt;
    if (ended && this.ctx.clock.now().getTime() > addMs(ended, minutes(DEFAULTS.CONTACT_WINDOW_MIN)).getTime()) throw refuse(); // allowed up to 30:00 after the end, refused after (SRS Q17)

    const other = User.fromRecord((isPassenger ? row.journey.driver : row.passenger) as UserRecord);
    const record = other.toRecord();
    this.ctx.logger.info({ viewerId, bookingId }, 'contact viewed');
    return { firstName: other.firstName, phone: record.phone };
  }

  // ---------------------------------------------------------------- internals

  private isFreshFix(p: Position, now: Date): boolean {
    const age = now.getTime() - new Date(p.ts).getTime();
    return age <= FIX_MAX_AGE_MS && age >= -FIX_MAX_AGE_MS;
  }
}
