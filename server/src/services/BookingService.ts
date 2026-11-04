/**
 * Task C3: booking (UC-7 booking steps, UC-10 Confirm Match, UC-11 Cancel Booking). The busiest service in the system.
 *
 *   preview  the wallet check before booking: ENOUGH / NOT_ENOUGH, plus ON_TRUST when the `bookOnTrust` flag is on (FR 10.2 to 10.4, one shared function)
 *   book     a PENDING booking; no hold and no seat yet (the driver has not said yes)
 *   accept   ONE transaction: lock the journey row, take the seat, hold the fare, re-tier everybody, resolve the hop request
 *   decline  PENDING -> CANCELLED (FR 5.5)
 *   cancel   the passenger withdraws before the trip starts; seat back, hold released, fares re-tiered (UC-11)
 *
 * Seats and money are never read-then-written: the journey row is locked (`SELECT ... FOR UPDATE`) and the seat update is also
 * conditional, so two drivers' accepts for the last seat can only ever produce one winner (NFR-3.1). A failed hold rolls the whole
 * accept back. An accept that cannot succeed because of the PASSENGER's situation (no seat left, wallet too low, account locked)
 * records the automatic decline and then tells the driver why, so the passenger is not left waiting on a request nobody can honour.
 */
import type { BalanceCheck, ErrorCode, Hop } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { lockJourney, lockUser, withTransaction } from '../core/transaction';
import { Booking, type BookingRecord } from '../entities/Booking';
import { Journey, type JourneyRecord } from '../entities/Journey';
import { AppError } from '../errors/AppError';
import { EventQueue } from '../events/bus';
import { assertOwner } from '../middleware/ownership';
import { FareService } from './FareService';
import { toBooking } from './mappers';
import { orderAlongRoute } from './matching';
import { storedPoints } from './RouteService';
import { trustDecision } from './trust';
import { WalletService } from './WalletService';

type BookBody = z.output<typeof Hop.BookBody>;
type BookingDto = z.infer<typeof Hop.Booking>;
type Preview = z.infer<typeof Hop.BookingPreview>;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

type AcceptOutcome = { ok: true } | { declined: ErrorCode };

/** What the driver is told when an Accept turns into an automatic decline. */
const DECLINED_FOR_DRIVER: Partial<Record<ErrorCode, string>> = {
  SEAT_UNAVAILABLE: 'No seat is left on this journey, so the request was declined.',
  ACCOUNT_LOCKED: "This passenger's account is locked for an unpaid fare, so the request was declined.",
  INSUFFICIENT_BALANCE: 'This passenger no longer has enough in their wallet, so the request was declined.',
};

export class BookingService {
  private readonly wallets: WalletService;
  private readonly fares: FareService;

  constructor(private readonly ctx: AppContext) {
    this.wallets = new WalletService(ctx);
    this.fares = new FareService(ctx, this.wallets);
  }

  // ---------------------------------------------------------------- UC-7: the wallet check

  async preview(passengerId: string, journeyId: string): Promise<Preview> {
    const db = this.ctx.db();
    const journey = await db.journey.findUnique({ where: { id: journeyId } });
    if (!journey) throw new AppError('NOT_FOUND');
    // The last seat may have gone between the matches list and this screen: say so, not a fare that cannot be booked.
    if (!Journey.fromRecord(journey as unknown as JourneyRecord).isOpenForBooking()) throw new AppError('SEAT_UNAVAILABLE');
    const [user, wallet, fareCents] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: passengerId } }),
      db.wallet.findUniqueOrThrow({ where: { userId: passengerId } }),
      this.fares.fareIfJoining(journeyId),
    ]);
    const availableCents = wallet.balanceCents - wallet.heldCents;
    return { fareCents, check: trustDecision(availableCents, user.completedRides, fareCents, this.ctx.flags.bookOnTrust), availableCents };
  }

  // ---------------------------------------------------------------- UC-7: book

  async book(passengerId: string, body: BookBody): Promise<BookingDto> {
    const queue = new EventQueue();
    const created = await withTransaction(async (tx) => {
      await lockJourney(tx, body.journeyId);
      await lockUser(tx, passengerId); // one booking at a time per passenger, even across two journeys (vetting race V-1)
      const journey = await tx.journey.findUnique({ where: { id: body.journeyId } });
      if (!journey) throw new AppError('NOT_FOUND', { message: 'That journey does not exist.' });
      const user = await tx.user.findUniqueOrThrow({ where: { id: passengerId } });
      if (user.accountStatus === 'LOCKED') throw new AppError('ACCOUNT_LOCKED');
      if (journey.driverId === passengerId) throw new AppError('FORBIDDEN', { message: 'You cannot book your own journey.' });
      const driving = await tx.journey.findFirst({ where: { driverId: passengerId, status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } });
      if (driving)
        throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'You have a journey live as a driver. Finish or cancel it before you book a ride.' });
      if (!Journey.fromRecord(journey as unknown as JourneyRecord).isOpenForBooking()) throw new AppError('SEAT_UNAVAILABLE');

      const [pickup, dropoff] = await Promise.all([
        tx.pickupPoint.findUnique({ where: { id: body.pickupPointId } }),
        tx.pickupPoint.findUnique({ where: { id: body.dropoffPointId } }),
      ]);
      if (!pickup || !dropoff) throw new AppError('NOT_FOUND', { message: 'That pickup point does not exist.' });

      if (body.hopRequestId) {
        const request = await tx.hopRequest.findUnique({ where: { id: body.hopRequestId } });
        if (!request) throw new AppError('NOT_FOUND', { message: 'That request does not exist.' });
        assertOwner(request.passengerId, passengerId, 'this request');
        if (request.status !== 'OPEN') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This request is no longer open.' });
      }

      const active = await tx.booking.findFirst({
        where: { passengerId, status: { in: ['PENDING', 'CONFIRMED'] }, journey: { status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } },
      });
      if (active) throw new AppError('CONFLICT', { message: 'You already have a booking in progress. Finish or cancel it first.' });
      // One booking per request is enforced by a unique index. A declined or cancelled booking gives the request back, so detach it:
      // otherwise the passenger could never book another driver from the same request (review finding).
      if (body.hopRequestId) {
        await tx.booking.updateMany({ where: { hopRequestId: body.hopRequestId, status: { in: ['CANCELLED'] } }, data: { hopRequestId: null } });
      }

      const fare = await this.fares.fareIfJoining(body.journeyId, tx);
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: passengerId } });
      const check: BalanceCheck = trustDecision(wallet.balanceCents - wallet.heldCents, user.completedRides, fare, this.ctx.flags.bookOnTrust);
      if (check === 'NOT_ENOUGH') throw new AppError('INSUFFICIENT_BALANCE');

      const row = await tx.booking.create({
        data: {
          journeyId: body.journeyId,
          passengerId,
          hopRequestId: body.hopRequestId ?? null,
          pickupPointId: body.pickupPointId,
          dropoffPointId: body.dropoffPointId,
          currentFareCents: fare,
          bookedOnTrust: check === 'ON_TRUST',
        },
      });
      queue.push('WalletChecked', { bookingId: row.id, passengerId, check });
      queue.push('BookingRequested', { bookingId: row.id, journeyId: row.journeyId, driverId: journey.driverId, passengerId });
      return row;
    });
    await this.ctx.bus.publish(queue);
    return toBooking(created);
  }

  // ---------------------------------------------------------------- UC-10: accept

  async accept(driverId: string, bookingId: string): Promise<BookingDto> {
    const first = await this.ctx.db().booking.findUnique({ where: { id: bookingId }, include: { journey: true } });
    if (!first) throw new AppError('NOT_FOUND');
    assertOwner(first.journey.driverId, driverId, 'this booking');
    const journeyId = first.journeyId;
    const now = this.ctx.clock.now();
    const queue = new EventQueue();

    const outcome = await withTransaction<AcceptOutcome>(async (tx) => {
      await lockJourney(tx, journeyId);
      const row = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      const jrow = await tx.journey.findUniqueOrThrow({ where: { id: journeyId } });
      const booking = Booking.fromRecord(row as BookingRecord);
      if (booking.status !== 'PENDING') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `This booking is already ${booking.status.toLowerCase()}.` });

      const autoDecline = async (code: ErrorCode): Promise<AcceptOutcome> => {
        booking.cancel();
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
        queue.push('BookingDeclined', { bookingId, journeyId, driverId, passengerId: row.passengerId, automatic: true });
        return { declined: code };
      };

      const journey = Journey.fromRecord(jrow as unknown as JourneyRecord);
      if (!journey.isOpenForBooking()) return autoDecline('SEAT_UNAVAILABLE'); // UC-10.EX.2

      const passenger = await tx.user.findUniqueOrThrow({ where: { id: row.passengerId } });
      if (passenger.accountStatus === 'LOCKED') return autoDecline('ACCOUNT_LOCKED');
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: row.passengerId } });
      const fare = this.fares.fareForRiders((await this.fares.confirmedRiders(journeyId, tx)) + 1);
      const check = trustDecision(wallet.balanceCents - wallet.heldCents, passenger.completedRides, fare, this.ctx.flags.bookOnTrust);
      if (check === 'NOT_ENOUGH') return autoDecline('INSUFFICIENT_BALANCE'); // the balance dropped since the request (UC-10)

      // The seat: the row is locked, and the update is conditional as well, so it can never go below zero.
      const before = { seats: jrow.seatsAvailable, status: jrow.status };
      journey.decrementSeats();
      const taken = await tx.journey.updateMany({
        where: { id: journeyId, seatsAvailable: before.seats, status: before.status },
        data: { seatsAvailable: journey.seatsAvailable, status: journey.status },
      });
      if (taken.count !== 1) throw new AppError('SEAT_UNAVAILABLE');

      booking.confirm(now, 0, 'HELD');
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CONFIRMED', confirmedAt: now, paymentStatus: 'HELD', currentFareCents: fare, bookedOnTrust: check === 'ON_TRUST' },
      });
      await this.wallets.hold(tx, bookingId, fare, { partial: check === 'ON_TRUST' }); // a failure here rolls everything back
      await this.fares.retier(tx, queue, journeyId);
      if (row.hopRequestId) await tx.hopRequest.updateMany({ where: { id: row.hopRequestId, status: 'OPEN' }, data: { status: 'MATCHED' } });
      queue.push('BookingConfirmed', { bookingId, journeyId, driverId, passengerId: row.passengerId });
      return { ok: true };
    });

    await this.ctx.bus.publish(queue);
    // The catalog texts speak to the passenger ("your wallet..."); the driver tapped Accept, so tell the driver what happened.
    if ('declined' in outcome) throw new AppError(outcome.declined, { message: DECLINED_FOR_DRIVER[outcome.declined] });
    return toBooking(await this.ctx.db().booking.findUniqueOrThrow({ where: { id: bookingId } }));
  }

  // ---------------------------------------------------------------- UC-10: decline

  async decline(driverId: string, bookingId: string): Promise<BookingDto> {
    const first = await this.ctx.db().booking.findUnique({ where: { id: bookingId }, include: { journey: true } });
    if (!first) throw new AppError('NOT_FOUND');
    assertOwner(first.journey.driverId, driverId, 'this booking');
    const queue = new EventQueue();
    const row = await withTransaction(async (tx) => {
      await lockJourney(tx, first.journeyId);
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (current.status !== 'PENDING') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'Only a request waiting for an answer can be declined.' });
      const booking = Booking.fromRecord(current as BookingRecord);
      booking.cancel();
      queue.push('BookingDeclined', { bookingId, journeyId: first.journeyId, driverId, passengerId: current.passengerId, automatic: false });
      return tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
    });
    await this.ctx.bus.publish(queue);
    return toBooking(row);
  }

  // ---------------------------------------------------------------- UC-11: cancel

  /** A locked passenger may still cancel (UC-11 assumption), so the route has no requireUnlocked. */
  async cancel(passengerId: string, bookingId: string): Promise<BookingDto> {
    const first = await this.ctx.db().booking.findUnique({ where: { id: bookingId } });
    if (!first) throw new AppError('NOT_FOUND');
    assertOwner(first.passengerId, passengerId, 'this booking');
    const queue = new EventQueue();

    const row = await withTransaction(async (tx) => {
      await lockJourney(tx, first.journeyId);
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      const jrow = await tx.journey.findUniqueOrThrow({ where: { id: first.journeyId } });
      if (['IN_PROGRESS', 'COMPLETED'].includes(jrow.status))
        throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'The trip has already started; you can no longer cancel.' }); // UC-11.EX.1
      const booking = Booking.fromRecord(current as BookingRecord);
      const wasConfirmed = booking.status === 'CONFIRMED';
      booking.cancel(); // ILLEGAL_STATE_TRANSITION if already cancelled or past pickup

      if (wasConfirmed) {
        await this.wallets.release(tx, bookingId);
        const journey = Journey.fromRecord(jrow as unknown as JourneyRecord);
        journey.incrementSeats();
        await tx.journey.update({ where: { id: jrow.id }, data: { seatsAvailable: journey.seatsAvailable, status: journey.status } });
      }
      const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', heldCents: 0 } });
      if (wasConfirmed) await this.fares.retier(tx, queue, jrow.id);
      queue.push('BookingCancelled', { bookingId, journeyId: jrow.id, driverId: jrow.driverId, passengerId, by: 'PASSENGER' });
      return updated;
    });
    await this.ctx.bus.publish(queue);
    return toBooking(row);
  }

  // ---------------------------------------------------------------- reading

  /** One booking: only its passenger or its journey's driver. */
  async get(userId: string, bookingId: string): Promise<BookingDto> {
    const row = await this.ctx.db().booking.findUnique({ where: { id: bookingId }, include: { journey: { include: { driver: true } }, passenger: true } });
    if (!row) throw new AppError('NOT_FOUND');
    if (row.passengerId !== userId && row.journey.driverId !== userId) throw new AppError('FORBIDDEN');
    const dto = toBooking(row, firstName((row.passengerId === userId ? row.journey.driver : row.passenger).name), row.journey.status);
    // A PENDING booking's stored fare was right when it was made; riders may have joined or left since. Show what accepting it costs now.
    if (row.status === 'PENDING' && Journey.fromRecord(row.journey as unknown as JourneyRecord).isOpenForBooking()) {
      dto.currentFareCents = await this.fares.fareIfJoining(row.journeyId);
    }
    return dto;
  }

  /** The driver's inbox. With the `reorderPickups` flag on, confirmed riders are listed in pickup order along the route (FR 4.11). */
  async forJourney(driverId: string, journeyId: string): Promise<BookingDto[]> {
    const db = this.ctx.db();
    const journey = await db.journey.findUnique({ where: { id: journeyId }, include: { route: true } });
    if (!journey) throw new AppError('NOT_FOUND');
    assertOwner(journey.driverId, driverId, 'this journey');
    const rows = await db.booking.findMany({ where: { journeyId }, include: { pickupPoint: true, passenger: true }, orderBy: { createdAt: 'asc' } });
    const ordered =
      this.ctx.flags.reorderPickups && journey.route
        ? orderAlongRoute(rows, storedPoints(journey.route.points), (b) => ({ lat: b.pickupPoint.latitude, lng: b.pickupPoint.longitude }))
        : rows;
    return ordered.map((b) => toBooking(b, firstName(b.passenger.name), journey.status));
  }

  /**
   * The job in D4: a request nobody answered before the trip started (or ended) is declined (FR 5.5). A journey goes live "now", so
   * its departure time is not a deadline for answering; the start of the trip is. Returns how many were declined.
   */
  async declineUnanswered(): Promise<number> {
    const due = await this.ctx.db().booking.findMany({ where: { status: 'PENDING', journey: { status: { in: ['IN_PROGRESS', 'COMPLETED'] } } } });
    let declined = 0;
    for (const b of due) {
      const queue = new EventQueue();
      const done = await withTransaction(async (tx) => {
        await lockJourney(tx, b.journeyId);
        const current = await tx.booking.findUniqueOrThrow({ where: { id: b.id }, include: { journey: true } });
        if (current.status !== 'PENDING') return false;
        await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
        queue.push('BookingDeclined', {
          bookingId: b.id,
          journeyId: b.journeyId,
          driverId: current.journey.driverId,
          passengerId: b.passengerId,
          automatic: true,
        });
        return true;
      });
      if (done) {
        declined += 1;
        await this.ctx.bus.publish(queue);
      }
    }
    return declined;
  }
}
