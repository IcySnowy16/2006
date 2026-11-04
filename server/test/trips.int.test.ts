/**
 * Task D1: Start Trip (UC-12), pickup transitions (UC-13), Complete + settlement (UC-14), contact by phone (UC-15 alternative flow).
 * Real PostgreSQL, a clock the test controls. Money is checked on the wallets AND on the ledger.
 */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { DomainEvents, EventName } from '../src/events/events';
import { minutes, sgDate } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { TripService } from '../src/services/TripService';
import { WalletService } from '../src/services/WalletService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

type Rider = Awaited<ReturnType<typeof makePassenger>>;

/** A driver, an OPEN journey leaving now, and `riders` confirmed bookings each holding the shared fare. */
async function trip(o: { riders?: number; fare?: number; balance?: number; held?: number; driver?: Parameters<typeof makeDriver>[0] } = {}) {
  const t = makeTestApp();
  const cat = await makeCatalog();
  const driver = await makeDriver(o.driver);
  const journey = await makeJourney(driver.id, { status: 'OPEN', seatsAvailable: 3 - (o.riders ?? 2), departureTime: t.clock.now() });
  const fare = o.fare ?? ((o.riders ?? 2) === 1 ? 300 : 200);
  const riders: Rider[] = [];
  const bookings = [];
  for (let i = 0; i < (o.riders ?? 2); i++) {
    const p = await makePassenger({ balanceCents: o.balance ?? 1000, heldCents: o.held ?? fare });
    riders.push(p);
    bookings.push(
      await makeBooking(journey.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
        status: 'CONFIRMED',
        currentFareCents: fare,
        heldCents: o.held ?? fare,
        paymentStatus: 'HELD',
      }),
    );
  }
  const events: { name: EventName; payload: unknown }[] = [];
  for (const name of ['TripStarted', 'PickupStatusChanged', 'TripCompleted', 'FareChanged', 'BookingDeclined', 'DebtRecorded', 'AccountLocked'] as const) {
    t.ctx.bus.on(name, (payload: DomainEvents[typeof name]) => void events.push({ name, payload }));
  }
  const cookie = t.cookieFor(driver);
  const fix = (offsetMs = 0) => ({ lat: 1.0, lng: 103.0, accuracyM: 6, ts: new Date(t.clock.now().getTime() + offsetMs).toISOString() });
  const start = (body: Record<string, unknown> = {}, id = journey.id, c = cookie) =>
    request(t.app)
      .post(`/api/journeys/${id}/start`)
      .set('Cookie', c)
      .send({ locationPermission: true, position: fix(), ...body });
  const mark = (bookingId: string, status: string, c = cookie) =>
    request(t.app).post(`/api/bookings/${bookingId}/pickup-status`).set('Cookie', c).send({ status });
  const complete = (c = cookie) => request(t.app).post(`/api/journeys/${journey.id}/complete`).set('Cookie', c);
  const wallet = (id: string) => prisma().wallet.findUniqueOrThrow({ where: { userId: id } });
  return { t, cat, driver, journey, riders, bookings, events, cookie, start, mark, complete, wallet, fix };
}

describe('D1: start trip gates (UC-12)', () => {
  it('starts: IN_PROGRESS, TripStarted for the confirmed riders, unanswered requests declined, first position stored', async () => {
    const w = await trip();
    const waiting = await makePassenger({ balanceCents: 500 });
    const pending = await makeBooking(w.journey.id, waiting.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id);
    const res = await w.start();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(w.events.find((e) => e.name === 'TripStarted')!.payload).toMatchObject({
      journeyId: w.journey.id,
      passengerIds: expect.arrayContaining(w.riders.map((r) => r.id)),
    });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
    expect(await prisma().locationUpdate.count({ where: { journeyId: w.journey.id } })).toBe(1);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).startedAt).not.toBeNull();
  });

  it('no confirmed booking -> ILLEGAL_STATE_TRANSITION', async () => {
    const w = await trip({ riders: 0 });
    expectError(await w.start(), 'ILLEGAL_STATE_TRANSITION');
  });

  it('before the departure time -> ILLEGAL_STATE_TRANSITION; at the departure time -> allowed (boundary)', async () => {
    const w = await trip();
    await prisma().journey.update({ where: { id: w.journey.id }, data: { departureTime: new Date(w.t.clock.now().getTime() + minutes(10)) } });
    expectError(await w.start(), 'ILLEGAL_STATE_TRANSITION');
    w.t.clock.advance(minutes(10));
    expect((await w.start()).status).toBe(200);
  });

  it("two paid trips today -> DAILY_TRIP_LIMIT_REACHED; one is fine; yesterday's two do not count (FR 6.4)", async () => {
    const today = sgDate(makeTestApp().clock.now());
    const two = await trip({ driver: { dailyPaidTrips: 2, lastPaidTripDate: today } });
    expectError(await two.start(), 'DAILY_TRIP_LIMIT_REACHED');
    const one = await trip({ driver: { dailyPaidTrips: 1, lastPaidTripDate: today } });
    expect((await one.start()).status).toBe(200);
    const old = await trip({ driver: { dailyPaidTrips: 2, lastPaidTripDate: '2026-10-18' } });
    expect((await old.start()).status).toBe(200);
  });

  it('no location permission -> LOCATION_PERMISSION_REQUIRED; no fresh GPS fix (stale or from the future) -> LOCATION_PERMISSION_REQUIRED', async () => {
    const w = await trip();
    expectError(await w.start({ locationPermission: false }), 'LOCATION_PERMISSION_REQUIRED');
    expectError(await w.start({ position: w.fix(-minutes(5)) }), 'LOCATION_PERMISSION_REQUIRED');
    expectError(await w.start({ position: w.fix(minutes(5)) }), 'LOCATION_PERMISSION_REQUIRED');
    expect((await w.start({ position: w.fix(-30_000) })).status).toBe(200);
  });

  it("someone else's journey -> FORBIDDEN; unknown -> NOT_FOUND; a second start -> ILLEGAL_STATE_TRANSITION", async () => {
    const w = await trip();
    expectError(await w.start({}, w.journey.id, w.t.cookieFor(await makeDriver())), 'FORBIDDEN');
    expectError(await w.start({}, 'nope'), 'NOT_FOUND');
    await w.start().expect(200);
    expectError(await w.start(), 'ILLEGAL_STATE_TRANSITION');
  });
});

describe('D1: pickup transitions (UC-13)', () => {
  it('WAITING -> ARRIVED (the system) -> PICKED_UP -> DROPPED_OFF; PICKED_UP is also allowed straight from WAITING', async () => {
    const w = await trip();
    await w.start().expect(200);
    const trips = new TripService(w.t.ctx);
    await trips.systemPickupStatus(w.bookings[0]!.id, 'ARRIVED', 12, 30);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: w.bookings[0]!.id } })).arrivedAt).not.toBeNull();
    expect((await w.mark(w.bookings[0]!.id, 'PICKED_UP')).body.pickupStatus).toBe('PICKED_UP');
    expect((await w.mark(w.bookings[0]!.id, 'DROPPED_OFF')).body.pickupStatus).toBe('DROPPED_OFF');
    expect((await w.mark(w.bookings[1]!.id, 'PICKED_UP')).body.pickupStatus).toBe('PICKED_UP');
    expect(w.events.filter((e) => e.name === 'PickupStatusChanged').length).toBe(4);
  });

  it('DROPPED_OFF before PICKED_UP, and a pickup status before the trip starts, are ILLEGAL_STATE_TRANSITION', async () => {
    const w = await trip();
    expectError(await w.mark(w.bookings[0]!.id, 'PICKED_UP'), 'ILLEGAL_STATE_TRANSITION'); // trip not started
    await w.start().expect(200);
    expectError(await w.mark(w.bookings[0]!.id, 'DROPPED_OFF'), 'ILLEGAL_STATE_TRANSITION');
  });

  it('another driver cannot change a pickup status; a passenger cannot either', async () => {
    const w = await trip();
    await w.start().expect(200);
    expectError(await w.mark(w.bookings[0]!.id, 'PICKED_UP', w.t.cookieFor(await makeDriver())), 'FORBIDDEN');
    expectError(await w.mark(w.bookings[0]!.id, 'PICKED_UP', w.t.cookieFor(w.riders[0]!)), 'FORBIDDEN');
    expectError(await w.mark('nope', 'PICKED_UP'), 'NOT_FOUND');
  });

  it('NO_SHOW: refused before ARRIVED, refused at 2:59 after ARRIVED, allowed at 3:00 (FakeClock)', async () => {
    const w = await trip();
    await w.start().expect(200);
    const id = w.bookings[0]!.id;
    expectError(await w.mark(id, 'NO_SHOW'), 'ILLEGAL_STATE_TRANSITION');
    await new TripService(w.t.ctx).systemPickupStatus(id, 'ARRIVED', 5, 10);
    w.t.clock.advance(minutes(3) - 1000);
    expectError(await w.mark(id, 'NO_SHOW'), 'ILLEGAL_STATE_TRANSITION');
    w.t.clock.advance(1000);
    expect((await w.mark(id, 'NO_SHOW')).body.pickupStatus).toBe('NO_SHOW');
  });

  it('NO_SHOW releases the hold, frees the seat and re-tiers the other rider back to $3.00 (FR 6.8, 5.1.3)', async () => {
    const w = await trip();
    w.t.ctx.flags.fareLock = false; // this test checks SRS FR 5.1.3 as written; the fareLock default is tested in vetting.int.test.ts
    await w.start().expect(200);
    const [a, b] = w.bookings;
    await new TripService(w.t.ctx).systemPickupStatus(a!.id, 'ARRIVED', 5, 10);
    w.t.clock.advance(minutes(3));
    await w.mark(a!.id, 'NO_SHOW').expect(200);

    expect((await w.wallet(w.riders[0]!.id)).heldCents).toBe(0);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).seatsAvailable).toBe(2);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: b!.id } })).currentFareCents).toBe(300);
    expect((await w.wallet(w.riders[1]!.id)).heldCents).toBe(300);
    expect(w.events.filter((e) => e.name === 'FareChanged').map((e) => e.payload)).toEqual([
      { bookingId: b!.id, passengerId: w.riders[1]!.id, oldCents: 200, newCents: 300 },
    ]);
  });
});

describe('D1: complete and settle (UC-14)', () => {
  it('refused while a rider is still PICKED_UP (UNRESOLVED_BOOKINGS); nothing changes', async () => {
    const w = await trip();
    await w.start().expect(200);
    await w.mark(w.bookings[0]!.id, 'PICKED_UP').expect(200);
    await w.mark(w.bookings[1]!.id, 'PICKED_UP').expect(200);
    await w.mark(w.bookings[1]!.id, 'DROPPED_OFF').expect(200);
    expectError(await w.complete(), 'UNRESOLVED_BOOKINGS');
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).status).toBe('IN_PROGRESS');
    expect((await w.wallet(w.riders[0]!.id)).heldCents).toBe(200);
  });

  it('two riders: each pays $2.00 from the hold, the driver is credited $4.00, bookings COMPLETED, counters move, TripCompleted once', async () => {
    const w = await trip();
    await w.start().expect(200);
    for (const b of w.bookings) {
      await w.mark(b.id, 'PICKED_UP').expect(200);
      await w.mark(b.id, 'DROPPED_OFF').expect(200);
    }
    const res = await w.complete();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    for (const r of w.riders) expect(await w.wallet(r.id)).toMatchObject({ balanceCents: 800, heldCents: 0 });
    expect(await w.wallet(w.driver.id)).toMatchObject({ balanceCents: 400 });
    for (const b of w.bookings)
      expect(await prisma().booking.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
        status: 'COMPLETED',
        finalFareCents: 200,
        paymentStatus: 'PAID',
        heldCents: 0,
      });
    for (const r of w.riders) expect((await prisma().user.findUniqueOrThrow({ where: { id: r.id } })).completedRides).toBe(1);
    expect((await prisma().driverProfile.findUniqueOrThrow({ where: { userId: w.driver.id } })).dailyPaidTrips).toBe(1);
    expect(w.events.filter((e) => e.name === 'TripCompleted')).toHaveLength(1);
    // the ledger agrees: money out of the riders equals money into the driver
    const out = await prisma().walletTransaction.aggregate({ _sum: { amountCents: true }, where: { type: 'DEDUCT' } });
    const into = await prisma().walletTransaction.aggregate({ _sum: { amountCents: true }, where: { type: 'CREDIT', walletUserId: w.driver.id } });
    expect(out._sum.amountCents).toBe(400);
    expect(into._sum.amountCents).toBe(400);
  });

  it('a second Complete is ILLEGAL_STATE_TRANSITION and does not charge again', async () => {
    const w = await trip({ riders: 1 });
    await w.start().expect(200);
    await w.mark(w.bookings[0]!.id, 'PICKED_UP');
    await w.mark(w.bookings[0]!.id, 'DROPPED_OFF');
    await w.complete().expect(200);
    expectError(await w.complete(), 'ILLEGAL_STATE_TRANSITION');
    expect(await w.wallet(w.riders[0]!.id)).toMatchObject({ balanceCents: 700 });
    expect(await w.wallet(w.driver.id)).toMatchObject({ balanceCents: 300 });
    expect(await prisma().walletTransaction.count({ where: { type: 'DEDUCT' } })).toBe(1);
  });

  it('one rider and one no-show: the rider pays the solo fare of $3.00; the no-show pays nothing and gets a fare of 0', async () => {
    const w = await trip();
    w.t.ctx.flags.fareLock = false; // this test checks SRS FR 5.1.3 as written; the fareLock default is tested in vetting.int.test.ts
    await w.start().expect(200);
    const [carried, absent] = w.bookings;
    await new TripService(w.t.ctx).systemPickupStatus(absent!.id, 'ARRIVED', 1, 1);
    w.t.clock.advance(minutes(3));
    await w.mark(absent!.id, 'NO_SHOW').expect(200);
    await w.mark(carried!.id, 'PICKED_UP');
    await w.mark(carried!.id, 'DROPPED_OFF');
    await w.complete().expect(200);
    expect(await prisma().booking.findUniqueOrThrow({ where: { id: carried!.id } })).toMatchObject({
      status: 'COMPLETED',
      finalFareCents: 300,
      paymentStatus: 'PAID',
    });
    expect(await prisma().booking.findUniqueOrThrow({ where: { id: absent!.id } })).toMatchObject({
      status: 'COMPLETED',
      finalFareCents: 0,
      pickupStatus: 'NO_SHOW',
    });
    expect(await w.wallet(w.riders[0]!.id)).toMatchObject({ balanceCents: 700 });
    expect(await w.wallet(w.riders[1]!.id)).toMatchObject({ balanceCents: 1000, heldCents: 0 });
    expect(await w.wallet(w.driver.id)).toMatchObject({ balanceCents: 300 });
  });

  it('a trip where nobody was carried completes without counting as a paid trip', async () => {
    const w = await trip({ riders: 1 });
    await w.start().expect(200);
    await new TripService(w.t.ctx).systemPickupStatus(w.bookings[0]!.id, 'ARRIVED', 1, 1);
    w.t.clock.advance(minutes(3));
    await w.mark(w.bookings[0]!.id, 'NO_SHOW').expect(200);
    await w.complete().expect(200);
    expect((await prisma().driverProfile.findUniqueOrThrow({ where: { userId: w.driver.id } })).dailyPaidTrips).toBe(0);
    expect((await w.wallet(w.driver.id)).balanceCents).toBe(0);
  });

  it('booked on trust and the wallet cannot cover the fare: the shortfall becomes a Debt, the account LOCKS, the booking is UNPAID (UC-13.EX.1)', async () => {
    const w = await trip({ riders: 1, fare: 300, balance: 230, held: 230 });
    await w.start().expect(200);
    await w.mark(w.bookings[0]!.id, 'PICKED_UP');
    await w.mark(w.bookings[0]!.id, 'DROPPED_OFF');
    await w.complete().expect(200);

    const rider = w.riders[0]!;
    expect(await w.wallet(rider.id)).toMatchObject({ balanceCents: 0, heldCents: 0 });
    expect(await w.wallet(w.driver.id)).toMatchObject({ balanceCents: 230 });
    expect(await prisma().debt.findFirstOrThrow({ where: { userId: rider.id } })).toMatchObject({ amountCents: 70, clearedAt: null });
    expect(await prisma().user.findUniqueOrThrow({ where: { id: rider.id } })).toMatchObject({ accountStatus: 'LOCKED', unpaidCount: 1, completedRides: 0 });
    expect(await prisma().booking.findUniqueOrThrow({ where: { id: w.bookings[0]!.id } })).toMatchObject({
      pickupStatus: 'UNPAID',
      paymentStatus: 'UNPAID',
      finalFareCents: 300,
    });
    expect(w.events.map((e) => e.name)).toEqual(expect.arrayContaining(['DebtRecorded', 'AccountLocked', 'TripCompleted']));

    // topping up exactly the shortfall unlocks and pays the driver the rest
    await request(w.t.app).post('/api/wallet/top-up').set('Cookie', w.t.cookieFor(rider)).send({ amountCents: 100 }).expect(200);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: rider.id } })).accountStatus).toBe('ACTIVE');
    expect((await w.wallet(w.driver.id)).balanceCents).toBe(300);
  });

  it('a failing wallet write rolls the whole settlement back: journey, bookings, wallets and ledger all unchanged (UC-14.EX.2)', async () => {
    const w = await trip();
    await w.start().expect(200);
    for (const b of w.bookings) {
      await w.mark(b.id, 'PICKED_UP');
      await w.mark(b.id, 'DROPPED_OFF');
    }
    const ledgerBefore = await prisma().walletTransaction.count();
    const spy = vi.spyOn(WalletService.prototype, 'credit').mockRejectedValue(new Error('simulated wallet failure'));
    try {
      expectError(await w.complete(), 'INTERNAL_ERROR');
    } finally {
      spy.mockRestore();
    }
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).status).toBe('IN_PROGRESS');
    for (const b of w.bookings)
      expect(await prisma().booking.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ status: 'CONFIRMED', heldCents: 200 });
    for (const r of w.riders) expect(await w.wallet(r.id)).toMatchObject({ balanceCents: 1000, heldCents: 200 });
    expect(await prisma().walletTransaction.count()).toBe(ledgerBefore);
    await w.complete().expect(200); // and retrying afterwards works
  });

  it('another driver cannot complete; a trip not in progress cannot be completed', async () => {
    const w = await trip();
    expectError(await w.complete(), 'ILLEGAL_STATE_TRANSITION');
    await w.start().expect(200);
    expectError(await w.complete(w.t.cookieFor(await makeDriver())), 'FORBIDDEN');
  });

  it('the third trip of the day is refused at go-live after two completed ones (FR 6.4 end to end)', async () => {
    const w = await trip({ riders: 1 });
    await prisma().driverProfile.update({ where: { userId: w.driver.id }, data: { dailyPaidTrips: 1, lastPaidTripDate: sgDate(w.t.clock.now()) } });
    await w.start().expect(200);
    await w.mark(w.bookings[0]!.id, 'PICKED_UP');
    await w.mark(w.bookings[0]!.id, 'DROPPED_OFF');
    await w.complete().expect(200);
    expect((await prisma().driverProfile.findUniqueOrThrow({ where: { userId: w.driver.id } })).dailyPaidTrips).toBe(2);
    const preset = await prisma().driverPreset.create({
      data: {
        driverId: w.driver.id,
        exitGateId: w.cat.mainGate.id,
        name: 'x',
        plan: 'SOLO',
        allowedPickupTypes: ['BUS_STOP'],
        detourToleranceMin: 3,
        scheduleDays: [],
        exemptionConfirmedAt: new Date(),
      },
    });
    expectError(
      await request(w.t.app).post('/api/journeys').set('Cookie', w.cookie).send({ presetId: preset.id, position: w.fix(), locationPermission: true }),
      'DAILY_TRIP_LIMIT_REACHED',
    );
  });
});

describe('D1: contact by phone (UC-15 alternative flow AC.2, FR 8.6, 8.7)', () => {
  const FORBIDDEN_MESSAGE = 'You cannot see contact details for this trip.';

  it("the passenger sees the driver's first name and number; the driver sees the passenger's; nothing else is returned", async () => {
    const w = await trip({ riders: 1 });
    const asPassenger = await request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.t.cookieFor(w.riders[0]!));
    const driverRow = await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } });
    expect(asPassenger.status).toBe(200);
    expect(asPassenger.body).toEqual({ firstName: driverRow.name.split(' ')[0], phone: driverRow.phone });
    const asDriver = await request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.cookie);
    const riderRow = await prisma().user.findUniqueOrThrow({ where: { id: w.riders[0]!.id } });
    expect(asDriver.body).toEqual({ firstName: riderRow.name.split(' ')[0], phone: riderRow.phone });
  });

  it('PENDING, CANCELLED, a stranger, an unknown booking and a cancelled journey all get the same FORBIDDEN (EX.3, EX.4)', async () => {
    const w = await trip({ riders: 1 });
    const pending = await makeBooking(w.journey.id, (await makePassenger()).id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id);
    const cancelled = await makeBooking(w.journey.id, (await makePassenger()).id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, { status: 'CANCELLED' });
    const responses = [
      await request(w.t.app).get(`/api/bookings/${pending.id}/contact`).set('Cookie', w.cookie),
      await request(w.t.app).get(`/api/bookings/${cancelled.id}/contact`).set('Cookie', w.cookie),
      await request(w.t.app)
        .get(`/api/bookings/${w.bookings[0]!.id}/contact`)
        .set('Cookie', w.t.cookieFor(await makePassenger())),
      await request(w.t.app).get('/api/bookings/nope/contact').set('Cookie', w.cookie),
    ];
    for (const r of responses) {
      const body = expectError(r, 'FORBIDDEN');
      expect(body.message).toBe(FORBIDDEN_MESSAGE);
    }
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'CANCELLED', cancelReason: 'DRIVER' } });
    expectError(await request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.cookie), 'FORBIDDEN');
  });

  it('after the trip it stays available for 30 minutes and is refused after that (SRS Q17)', async () => {
    const w = await trip({ riders: 1 });
    await w.start().expect(200);
    await w.mark(w.bookings[0]!.id, 'PICKED_UP');
    await w.mark(w.bookings[0]!.id, 'DROPPED_OFF');
    await w.complete().expect(200);
    const get = () => request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.t.cookieFor(w.riders[0]!));
    w.t.clock.advance(minutes(29));
    expect((await get()).status).toBe(200);
    w.t.clock.advance(minutes(1));
    expect((await get()).status).toBe(200); // exactly 30:00
    w.t.clock.advance(minutes(1));
    expectError(await get(), 'FORBIDDEN'); // 31:00
  });

  it('a rider who was a no-show cannot be contacted afterwards', async () => {
    const w = await trip({ riders: 1 });
    await w.start().expect(200);
    await new TripService(w.t.ctx).systemPickupStatus(w.bookings[0]!.id, 'ARRIVED', 1, 1);
    w.t.clock.advance(minutes(3));
    await w.mark(w.bookings[0]!.id, 'NO_SHOW');
    await w.complete().expect(200);
    expectError(await request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.cookie), 'FORBIDDEN');
  });

  it('the number never appears in a log line; only who asked and which booking', async () => {
    const w = await trip({ riders: 1 });
    const lines: { obj: Record<string, unknown>; msg?: string }[] = [];
    const capture = (obj: Record<string, unknown>, msg?: string) => void lines.push({ obj, msg });
    w.t.ctx.logger = { debug: capture, info: capture, warn: capture, error: capture };
    const res = await request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.t.cookieFor(w.riders[0]!));
    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.obj).toEqual({ viewerId: w.riders[0]!.id, bookingId: w.bookings[0]!.id });
    expect(JSON.stringify(lines)).not.toContain(res.body.phone);
  });

  it('the contactCall flag is a kill switch: off -> FORBIDDEN for everyone', async () => {
    const w = await trip({ riders: 1 });
    w.t.ctx.flags.contactCall = false;
    expectError(await request(w.t.app).get(`/api/bookings/${w.bookings[0]!.id}/contact`).set('Cookie', w.t.cookieFor(w.riders[0]!)), 'FORBIDDEN');
  });
});
