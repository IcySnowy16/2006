/**
 * Task C3: booking (UC-7 booking steps, UC-10, UC-11) over HTTP, real PostgreSQL. The seat and money rules are tested where they can
 * fail: the last seat won by two drivers' accepts at once, the fare falling and rising as riders come and go, a failed hold.
 */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { DomainEvents, EventName } from '../src/events/events';
import { prisma } from '../src/core/prisma';
import { BookingService } from '../src/services/BookingService';
import { WalletService } from '../src/services/WalletService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

async function world(o: { plan?: 'SOLO' | 'SHARING'; seats?: number } = {}) {
  const t = makeTestApp();
  const cat = await makeCatalog();
  const driver = await makeDriver();
  const journey = await makeJourney(driver.id, { plan: o.plan ?? 'SHARING', seatsAvailable: o.seats, departureTime: t.clock.now() });
  const book = (who: { id: string; isDriver: boolean; isPassenger: boolean }, body: Record<string, unknown> = {}) =>
    request(t.app)
      .post('/api/bookings')
      .set('Cookie', t.cookieFor(who))
      .send({ journeyId: journey.id, pickupPointId: cat.pickup.hallBBus.id, dropoffPointId: cat.pickup.gateBus.id, ...body });
  const as = (who: { id: string; isDriver: boolean; isPassenger: boolean }) => t.cookieFor(who);
  const events: { name: EventName; payload: unknown }[] = [];
  for (const name of ['BookingRequested', 'BookingConfirmed', 'BookingDeclined', 'BookingCancelled', 'FareChanged', 'WalletChecked'] as const) {
    t.ctx.bus.on(name, (payload: DomainEvents[typeof name]) => void events.push({ name, payload }));
  }
  const acceptAs = (id: string, who = driver) => request(t.app).post(`/api/bookings/${id}/accept`).set('Cookie', t.cookieFor(who));
  const wallet = async (id: string) => prisma().wallet.findUniqueOrThrow({ where: { userId: id } });
  return { t, cat, driver, journey, book, as, events, acceptAs, wallet };
}

describe('C3: the wallet check before booking (UC-7, FR 10.2 to 10.4)', () => {
  const preview = (w: Awaited<ReturnType<typeof world>>, who: { id: string; isDriver: boolean; isPassenger: boolean }) =>
    request(w.t.app).get(`/api/bookings/preview?journeyId=${w.journey.id}`).set('Cookie', w.as(who));

  it('enough money -> ENOUGH with the fare and the available amount', async () => {
    const w = await world();
    const res = await preview(w, await makePassenger({ balanceCents: 500, heldCents: 100 }));
    expect(res.body).toEqual({ fareCents: 300, check: 'ENOUGH', availableCents: 400 });
  });

  it('flag OFF (default): 75% of the fare with 3 rides is NOT_ENOUGH, and booking is refused', async () => {
    const w = await world();
    expect((await preview(w, await makePassenger({ balanceCents: 225, completedRides: 3 }))).body.check).toBe('NOT_ENOUGH');
    expectError(await w.book(await makePassenger({ balanceCents: 230, completedRides: 3 })), 'INSUFFICIENT_BALANCE');
    expect(await prisma().booking.count()).toBe(0);
  });

  it('flag ON: exactly 75% of the fare with 3 rides is ON_TRUST; 74% is NOT_ENOUGH; 2 rides is NOT_ENOUGH', async () => {
    const w = await world();
    w.t.ctx.flags.bookOnTrust = true;
    expect((await preview(w, await makePassenger({ balanceCents: 225, completedRides: 3 }))).body.check).toBe('ON_TRUST');
    expect((await preview(w, await makePassenger({ balanceCents: 224, completedRides: 3 }))).body.check).toBe('NOT_ENOUGH');
    expect((await preview(w, await makePassenger({ balanceCents: 225, completedRides: 2 }))).body.check).toBe('NOT_ENOUGH');
  });

  it('shows the fare the rider would pay after joining ($2.00 when someone is already confirmed); unknown journey is NOT_FOUND', async () => {
    const w = await world();
    const other = await makePassenger({ balanceCents: 500 });
    await makeBooking(w.journey.id, other.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, { status: 'CONFIRMED' });
    expect((await preview(w, await makePassenger({ balanceCents: 500 }))).body.fareCents).toBe(200);
    expectError(
      await request(w.t.app)
        .get('/api/bookings/preview?journeyId=nope')
        .set('Cookie', w.as(await makePassenger())),
      'NOT_FOUND',
    );
  });
});

describe('C3: book (UC-7)', () => {
  it('creates a PENDING booking with the current fare and NO hold and NO seat taken yet; the driver is notified and the wallet check is recorded', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const res = await w.book(p);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      pickupStatus: 'WAITING',
      paymentStatus: null,
      bookedOnTrust: false,
      currentFareCents: 300,
      finalFareCents: null,
    });
    expect((await w.wallet(p.id)).heldCents).toBe(0);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).seatsAvailable).toBe(3);
    expect(w.events.map((e) => e.name).sort()).toEqual(['BookingRequested', 'WalletChecked']);
  });

  it('a full journey -> SEAT_UNAVAILABLE; a cancelled one too', async () => {
    const w = await world();
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'FULL', seatsAvailable: 0 } });
    expectError(await w.book(await makePassenger({ balanceCents: 500 })), 'SEAT_UNAVAILABLE');
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'CANCELLED', seatsAvailable: 2 } });
    expectError(await w.book(await makePassenger({ balanceCents: 500 })), 'SEAT_UNAVAILABLE');
  });

  it('a LOCKED passenger -> ACCOUNT_LOCKED; not enough money -> INSUFFICIENT_BALANCE; an unverified e-mail -> EMAIL_NOT_VERIFIED', async () => {
    const w = await world();
    expectError(await w.book(await makePassenger({ balanceCents: 500, accountStatus: 'LOCKED' })), 'ACCOUNT_LOCKED');
    expectError(await w.book(await makePassenger({ balanceCents: 100 })), 'INSUFFICIENT_BALANCE');
    expectError(await w.book(await makePassenger({ balanceCents: 500, accountStatus: 'PENDING_VERIFICATION' })), 'EMAIL_NOT_VERIFIED');
    expect(await prisma().booking.count()).toBe(0);
  });

  it('on trust (flag ON) is remembered on the booking', async () => {
    const w = await world();
    w.t.ctx.flags.bookOnTrust = true;
    const res = await w.book(await makePassenger({ balanceCents: 230, completedRides: 3 }));
    expect(res.status).toBe(201);
    expect(res.body.bookedOnTrust).toBe(true);
  });

  it("refuses your own journey, a second booking while one is active, an unknown pickup point and someone else's request", async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 1000 });
    expect((await w.book(p)).status).toBe(201);
    expectError(await w.book(p), 'CONFLICT');
    expectError(await w.book(await makePassenger({ balanceCents: 500 }), { pickupPointId: 'nope' }), 'NOT_FOUND');

    const stranger = await makePassenger({ balanceCents: 500 });
    const request2 = await prisma().hopRequest.create({
      data: {
        passengerId: p.id,
        fromLocationId: w.cat.hallB.id,
        toLocationId: w.cat.mainGate.id,
        requestedTime: w.t.clock.now(),
        expiresAt: new Date(w.t.clock.now().getTime() + 900_000),
      },
    });
    expectError(await w.book(stranger, { hopRequestId: request2.id }), 'FORBIDDEN');
  });

  it('a driver acting as a driver cannot book (passenger route)', async () => {
    const w = await world();
    expectError(await w.book(await makeDriver()), 'FORBIDDEN');
  });
});

describe('C3: accept (UC-10)', () => {
  it('takes the seat, holds the fare, moves LIVE to OPEN, resolves the hop request and emits BookingConfirmed', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const hop = await prisma().hopRequest.create({
      data: {
        passengerId: p.id,
        fromLocationId: w.cat.hallB.id,
        toLocationId: w.cat.mainGate.id,
        requestedTime: w.t.clock.now(),
        expiresAt: new Date(w.t.clock.now().getTime() + 900_000),
      },
    });
    const booking = (await w.book(p, { hopRequestId: hop.id })).body;

    const res = await w.acceptAs(booking.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'HELD', currentFareCents: 300 });
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).toMatchObject({ status: 'OPEN', seatsAvailable: 2 });
    expect(await w.wallet(p.id)).toMatchObject({ balanceCents: 500, heldCents: 300 });
    expect((await prisma().hopRequest.findUniqueOrThrow({ where: { id: hop.id } })).status).toBe('MATCHED');
    expect(w.events.map((e) => e.name)).toContain('BookingConfirmed');
    expect(await prisma().walletTransaction.findFirstOrThrow({ where: { type: 'HOLD' } })).toMatchObject({ amountCents: 300, bookingId: booking.id });
  });

  it("only the journey's own driver may accept; a passenger cannot; unknown is NOT_FOUND; accepting twice is ILLEGAL_STATE_TRANSITION", async () => {
    const w = await world();
    const booking = (await w.book(await makePassenger({ balanceCents: 500 }))).body;
    expectError(await w.acceptAs(booking.id, await makeDriver()), 'FORBIDDEN');
    expectError(
      await request(w.t.app)
        .post(`/api/bookings/${booking.id}/accept`)
        .set('Cookie', w.as(await makePassenger())),
      'FORBIDDEN',
    );
    expectError(await w.acceptAs('nope'), 'NOT_FOUND');
    await w.acceptAs(booking.id).expect(200);
    expectError(await w.acceptAs(booking.id), 'ILLEGAL_STATE_TRANSITION');
  });

  it('the LAST seat can be won only once: two accepts at the same moment -> one CONFIRMED, one auto-declined with SEAT_UNAVAILABLE', async () => {
    const w = await world({ plan: 'SOLO' });
    const a = await makePassenger({ balanceCents: 500 });
    const b = await makePassenger({ balanceCents: 500 });
    const ba = (await w.book(a)).body;
    const bb = (await w.book(b)).body;

    const [r1, r2] = await Promise.all([w.acceptAs(ba.id), w.acceptAs(bb.id)]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expectError(loser, 'SEAT_UNAVAILABLE');

    expect(await prisma().booking.count({ where: { journeyId: w.journey.id, status: 'CONFIRMED' } })).toBe(1);
    expect(await prisma().booking.count({ where: { journeyId: w.journey.id, status: 'CANCELLED' } })).toBe(1);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).toMatchObject({ status: 'FULL', seatsAvailable: 0 });
    expect(w.events.filter((e) => e.name === 'BookingDeclined' && (e.payload as { automatic: boolean }).automatic)).toHaveLength(1);
    // only the winner has money on hold
    expect((await prisma().wallet.aggregate({ _sum: { heldCents: true }, where: { userId: { in: [a.id, b.id] } } }))._sum.heldCents).toBe(300);
  });

  it('many accepts at once never take more seats than exist (3 seats, 6 requests)', async () => {
    const w = await world();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await w.book(await makePassenger({ balanceCents: 500 }))).body.id);
    const results = await Promise.all(ids.map((id) => w.acceptAs(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).toMatchObject({ status: 'FULL', seatsAvailable: 0 });
  });

  it('fares fall as riders join: 300 -> 200 for both, holds adjust, FareChanged for the first rider (SRS Q9)', async () => {
    const w = await world();
    const a = await makePassenger({ balanceCents: 500 });
    const b = await makePassenger({ balanceCents: 500 });
    const ba = (await w.book(a)).body;
    await w.acceptAs(ba.id).expect(200);
    expect(await w.wallet(a.id)).toMatchObject({ heldCents: 300 });

    const bb = (await w.book(b)).body;
    expect(bb.currentFareCents).toBe(200); // the second rider is quoted the shared fare
    await w.acceptAs(bb.id).expect(200);
    expect((await request(w.t.app).get(`/api/bookings/${ba.id}`).set('Cookie', w.as(a))).body.currentFareCents).toBe(200);
    expect(await w.wallet(a.id)).toMatchObject({ heldCents: 200 });
    expect(await w.wallet(b.id)).toMatchObject({ heldCents: 200 });
    const changed = w.events.filter((e) => e.name === 'FareChanged').map((e) => e.payload);
    expect(changed).toEqual([{ bookingId: ba.id, passengerId: a.id, oldCents: 300, newCents: 200 }]);
  });

  it('cancelling one of two riders puts the other back to $3.00 with the hold raised, and the seat returns (FULL -> OPEN)', async () => {
    const w = await world({ plan: 'SHARING' });
    const a = await makePassenger({ balanceCents: 500 });
    const b = await makePassenger({ balanceCents: 500 });
    const ba = (await w.book(a)).body;
    await w.acceptAs(ba.id);
    const bb = (await w.book(b)).body;
    await w.acceptAs(bb.id);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).seatsAvailable).toBe(1);

    const res = await request(w.t.app).post(`/api/bookings/${bb.id}/cancel`).set('Cookie', w.as(b));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(await w.wallet(b.id)).toMatchObject({ heldCents: 0 });
    expect(await w.wallet(a.id)).toMatchObject({ heldCents: 300 });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: ba.id } })).currentFareCents).toBe(300);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).seatsAvailable).toBe(2);
    expect(w.events.filter((e) => e.name === 'FareChanged').at(-1)!.payload).toMatchObject({ bookingId: ba.id, oldCents: 200, newCents: 300 });
  });

  // Changed after the fullstack review: on a SOLO journey the only rider leaving means nobody is confirmed, so it goes back to LIVE
  // (the 15-minute window and the expiry sweep apply again) instead of staying OPEN for ever. FULL -> OPEN with riders left is
  // covered by the Journey entity tests.
  it('a FULL solo journey whose rider cancels is LIVE again, with its seat free', async () => {
    const w = await world({ plan: 'SOLO' });
    const a = await makePassenger({ balanceCents: 500 });
    const ba = (await w.book(a)).body;
    await w.acceptAs(ba.id).expect(200);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).status).toBe('FULL');
    await request(w.t.app).post(`/api/bookings/${ba.id}/cancel`).set('Cookie', w.as(a)).expect(200);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).toMatchObject({ status: 'LIVE', seatsAvailable: 1 });
  });

  it('if the balance dropped since the request, the accept auto-declines with INSUFFICIENT_BALANCE (UC-10)', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    await prisma().wallet.update({ where: { userId: p.id }, data: { balanceCents: 100 } });
    expectError(await w.acceptAs(booking.id), 'INSUFFICIENT_BALANCE');
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED');
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).seatsAvailable).toBe(3);
  });

  it('a passenger booked on trust (flag ON) is held only what the wallet has, and the booking stays on trust', async () => {
    const w = await world();
    w.t.ctx.flags.bookOnTrust = true;
    const p = await makePassenger({ balanceCents: 230, completedRides: 3 });
    const booking = (await w.book(p)).body;
    const res = await w.acceptAs(booking.id);
    expect(res.status).toBe(200);
    expect(res.body.bookedOnTrust).toBe(true);
    expect(await w.wallet(p.id)).toMatchObject({ balanceCents: 230, heldCents: 230 });
  });

  it('a passenger who became LOCKED in between is auto-declined', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    await prisma().user.update({ where: { id: p.id }, data: { accountStatus: 'LOCKED' } });
    expectError(await w.acceptAs(booking.id), 'ACCOUNT_LOCKED');
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED');
  });

  it('a failed hold rolls the whole accept back: booking still PENDING, seat not taken, nothing on the ledger', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    const spy = vi.spyOn(WalletService.prototype, 'hold').mockRejectedValueOnce(new Error('simulated database failure'));
    try {
      expectError(await w.acceptAs(booking.id), 'INTERNAL_ERROR');
    } finally {
      spy.mockRestore();
    }
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PENDING');
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).toMatchObject({ status: 'LIVE', seatsAvailable: 3 });
    expect(await prisma().walletTransaction.count()).toBe(0);
    await w.acceptAs(booking.id).expect(200); // and the same request can still be accepted afterwards
  });
});

describe('C3: decline (UC-10)', () => {
  it('declines a pending request and emits BookingDeclined (not automatic)', async () => {
    const w = await world();
    const booking = (await w.book(await makePassenger({ balanceCents: 500 }))).body;
    const res = await request(w.t.app).post(`/api/bookings/${booking.id}/decline`).set('Cookie', w.t.cookieFor(w.driver));
    expect(res.body.status).toBe('CANCELLED');
    expect(w.events.find((e) => e.name === 'BookingDeclined')!.payload).toMatchObject({ automatic: false });
  });

  it('a confirmed booking cannot be declined; another driver cannot decline', async () => {
    const w = await world();
    const booking = (await w.book(await makePassenger({ balanceCents: 500 }))).body;
    expectError(
      await request(w.t.app)
        .post(`/api/bookings/${booking.id}/decline`)
        .set('Cookie', w.t.cookieFor(await makeDriver())),
      'FORBIDDEN',
    );
    await w.acceptAs(booking.id);
    expectError(await request(w.t.app).post(`/api/bookings/${booking.id}/decline`).set('Cookie', w.t.cookieFor(w.driver)), 'ILLEGAL_STATE_TRANSITION');
  });
});

describe('C3: cancel (UC-11)', () => {
  it('a pending booking can be cancelled; the seat count does not change', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    const res = await request(w.t.app).post(`/api/bookings/${booking.id}/cancel`).set('Cookie', w.as(p));
    expect(res.body.status).toBe('CANCELLED');
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: w.journey.id } })).seatsAvailable).toBe(3);
  });

  it('while the trip is IN_PROGRESS -> ILLEGAL_STATE_TRANSITION (UC-11.EX.1) and nothing changes', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    await w.acceptAs(booking.id);
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'IN_PROGRESS' } });
    expectError(await request(w.t.app).post(`/api/bookings/${booking.id}/cancel`).set('Cookie', w.as(p)), 'ILLEGAL_STATE_TRANSITION');
    expect(await w.wallet(p.id)).toMatchObject({ heldCents: 300 });
  });

  it('a LOCKED passenger may still cancel; another passenger may not; a second cancel is refused', async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    await prisma().user.update({ where: { id: p.id }, data: { accountStatus: 'LOCKED' } });
    expectError(
      await request(w.t.app)
        .post(`/api/bookings/${booking.id}/cancel`)
        .set('Cookie', w.as(await makePassenger())),
      'FORBIDDEN',
    );
    expect((await request(w.t.app).post(`/api/bookings/${booking.id}/cancel`).set('Cookie', w.as(p))).status).toBe(200);
    expectError(await request(w.t.app).post(`/api/bookings/${booking.id}/cancel`).set('Cookie', w.as(p)), 'ILLEGAL_STATE_TRANSITION');
  });
});

describe('C3: reading', () => {
  it("GET /api/bookings/:id is for the booking's passenger and driver only", async () => {
    const w = await world();
    const p = await makePassenger({ balanceCents: 500 });
    const booking = (await w.book(p)).body;
    expect((await request(w.t.app).get(`/api/bookings/${booking.id}`).set('Cookie', w.as(p))).status).toBe(200);
    expect((await request(w.t.app).get(`/api/bookings/${booking.id}`).set('Cookie', w.as(w.driver))).status).toBe(200);
    expectError(
      await request(w.t.app)
        .get(`/api/bookings/${booking.id}`)
        .set('Cookie', w.as(await makePassenger())),
      'FORBIDDEN',
    );
    expectError(await request(w.t.app).get('/api/bookings/nope').set('Cookie', w.as(p)), 'NOT_FOUND');
  });

  it("the driver inbox lists the journey's bookings; another driver is FORBIDDEN", async () => {
    const w = await world();
    await w.book(await makePassenger({ balanceCents: 500 }));
    const res = await request(w.t.app).get(`/api/journeys/${w.journey.id}/bookings`).set('Cookie', w.as(w.driver));
    expect(res.body).toHaveLength(1);
    expectError(
      await request(w.t.app)
        .get(`/api/journeys/${w.journey.id}/bookings`)
        .set('Cookie', w.as(await makeDriver())),
      'FORBIDDEN',
    );
  });

  it('with the reorderPickups flag on, riders are listed in pickup order along the route (FR 4.11)', async () => {
    const w = await world();
    const early = await makePassenger({ balanceCents: 500 });
    const late = await makePassenger({ balanceCents: 500 });
    await makeBooking(w.journey.id, late.id, w.cat.pickup.gateBus.id, w.cat.pickup.gateBus.id); // near the end of the route, booked first
    await makeBooking(w.journey.id, early.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id);
    const list = async () =>
      (await request(w.t.app).get(`/api/journeys/${w.journey.id}/bookings`).set('Cookie', w.as(w.driver))).body.map(
        (b: { pickupPointId: string }) => b.pickupPointId,
      );
    expect(await list()).toEqual([w.cat.pickup.gateBus.id, w.cat.pickup.hallABus.id]);
    w.t.ctx.flags.reorderPickups = true;
    expect(await list()).toEqual([w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id]);
  });
});

describe('C3: unanswered requests (job in D4)', () => {
  it('a pending request on a journey that has started is declined; one on a live journey is left alone', async () => {
    const w = await world();
    const a = await makePassenger({ balanceCents: 500 });
    const stale = await makeBooking(w.journey.id, a.id, w.cat.pickup.hallBBus.id, w.cat.pickup.gateBus.id);
    const other = await makeJourney((await makeDriver()).id, { status: 'IN_PROGRESS' });
    const b = await makePassenger({ balanceCents: 500 });
    const running = await makeBooking(other.id, b.id, w.cat.pickup.hallBBus.id, w.cat.pickup.gateBus.id);
    expect(await new BookingService(w.t.ctx).declineUnanswered()).toBe(1);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: running.id } })).status).toBe('CANCELLED');
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('PENDING');
  });
});
