/**
 * Regression tests for the fullstack review (19 Oct 2026): each test is one confirmed finding, written so it failed before the fix.
 * Real PostgreSQL, fake adapters, a clock the test controls.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/core/prisma';
import { LocationService } from '../src/realtime/LocationService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makeUser } from './helpers';
import { makeTestApp } from './helpers/app';

async function openRequest(passengerId: string, cat: Awaited<ReturnType<typeof makeCatalog>>) {
  return prisma().hopRequest.create({
    data: {
      passengerId,
      fromLocationId: cat.hallA.id,
      toLocationId: cat.mainGate.id,
      requestedTime: new Date('2026-10-19T08:00:00Z'),
      expiresAt: new Date('2026-10-19T08:15:00Z'),
    },
  });
}

describe('stuck flows', () => {
  it('after a decline the passenger can book another driver from the SAME request (it used to fail with CONFLICT)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const [d1, d2] = [await makeDriver(), await makeDriver()];
    const p = await makePassenger({ balanceCents: 1000 });
    const [j1, j2] = [await makeJourney(d1.id), await makeJourney(d2.id)];
    const req = await openRequest(p.id, cat);
    const body = (journeyId: string) => ({ journeyId, hopRequestId: req.id, pickupPointId: cat.pickup.hallABus.id, dropoffPointId: cat.pickup.gateBus.id });

    const first = await request(t.app).post('/api/bookings').set('Cookie', t.cookieFor(p)).send(body(j1.id));
    expect(first.status).toBe(201);
    await request(t.app).post(`/api/bookings/${first.body.id}/decline`).set('Cookie', t.cookieFor(d1)).expect(200);
    const second = await request(t.app).post('/api/bookings').set('Cookie', t.cookieFor(p)).send(body(j2.id));
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: second.body.id } })).hopRequestId).toBe(req.id);
  });

  it('a passenger can withdraw an open request, then ask again; a stranger cannot withdraw it; twice is refused', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const p = await makePassenger();
    const other = await makePassenger();
    const req = await openRequest(p.id, cat);
    expectError(await request(t.app).post(`/api/hop-requests/${req.id}/cancel`).set('Cookie', t.cookieFor(other)), 'FORBIDDEN');
    const res = await request(t.app).post(`/api/hop-requests/${req.id}/cancel`).set('Cookie', t.cookieFor(p));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expectError(await request(t.app).post(`/api/hop-requests/${req.id}/cancel`).set('Cookie', t.cookieFor(p)), 'ILLEGAL_STATE_TRANSITION');
    expect((await request(t.app).get('/api/hop-requests/mine').set('Cookie', t.cookieFor(p))).body).toEqual([]);
  });

  it('when the only confirmed rider cancels, the journey goes back to LIVE and the sweep can expire it (it used to stay OPEN for ever)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger({ balanceCents: 1000, heldCents: 300 });
    const j = await makeJourney(d.id, { status: 'OPEN', seatsAvailable: 2 });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', heldCents: 300, paymentStatus: 'HELD' });
    await request(t.app).post(`/api/bookings/${b.id}/cancel`).set('Cookie', t.cookieFor(p)).expect(200);
    const after = await prisma().journey.findUniqueOrThrow({ where: { id: j.id } });
    expect(after.status).toBe('LIVE');
    expect(after.seatsAvailable).toBe(3);
    t.clock.set(new Date('2026-10-19T08:16:00Z')); // past the 15-minute window
    const { GeofenceService } = await import('../src/services/GeofenceService');
    await new GeofenceService(t.ctx).expireDue();
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('EXPIRED');
  });

  it('a driver whose GPS never says ARRIVED can say "I have arrived" and, 3 minutes later, mark a no-show', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger({ balanceCents: 1000, heldCents: 300 });
    const j = await makeJourney(d.id, { status: 'IN_PROGRESS', seatsAvailable: 2 });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', heldCents: 300, paymentStatus: 'HELD' });
    const mark = (status: string) => request(t.app).post(`/api/bookings/${b.id}/pickup-status`).set('Cookie', t.cookieFor(d)).send({ status });
    expect((await mark('ARRIVED')).status).toBe(200);
    expectError(await mark('NO_SHOW'), 'ILLEGAL_STATE_TRANSITION'); // not yet: the 3 minutes start now
    t.clock.advance(3 * 60_000);
    expect((await mark('NO_SHOW')).status).toBe(200);
    expectError(await request(t.app).post(`/api/bookings/${b.id}/pickup-status`).set('Cookie', t.cookieFor(p)).send({ status: 'ARRIVED' }), 'FORBIDDEN'); // only the driver
  });

  it('the preview on a journey that has just filled says SEAT_UNAVAILABLE (it used to show a fare, or crash with "4 riders")', async () => {
    const t = makeTestApp();
    const d = await makeDriver();
    const p = await makePassenger({ balanceCents: 1000 });
    const j = await makeJourney(d.id, { status: 'FULL', seatsAvailable: 0 });
    expectError(await request(t.app).get(`/api/bookings/preview?journeyId=${j.id}`).set('Cookie', t.cookieFor(p)), 'SEAT_UNAVAILABLE');
  });
});

describe('roles and sessions', () => {
  it('a passenger with a PENDING booking cannot switch to driver (the driver could accept it while they drive)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const both = await makeUser({ isDriver: true, isPassenger: true, lastActiveRole: 'PASSENGER', balanceCents: 1000 });
    const j = await makeJourney(d.id);
    await makeBooking(j.id, both.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'PENDING' });
    expectError(
      await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(both, 'PASSENGER')).send({ role: 'DRIVER' }),
      'ILLEGAL_STATE_TRANSITION',
    );
  });

  it('someone driving a live journey cannot book a ride as a passenger at the same time', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const other = await makeDriver();
    const both = await makeUser({ isDriver: true, isPassenger: true, lastActiveRole: 'PASSENGER', balanceCents: 1000 });
    await makeJourney(both.id, { status: 'LIVE' }); // no vehicle profile needed: the rule is about the live journey
    const theirs = await makeJourney(other.id);
    expectError(
      await request(t.app)
        .post('/api/bookings')
        .set('Cookie', t.cookieFor(both, 'PASSENGER'))
        .send({ journeyId: theirs.id, pickupPointId: cat.pickup.hallABus.id, dropoffPointId: cat.pickup.gateBus.id }),
      'ILLEGAL_STATE_TRANSITION',
    );
  });

  it('signing out ends every session of the user, not just this browser', async () => {
    const t = makeTestApp();
    const p = await makePassenger();
    const phoneA = t.cookieFor(p);
    const phoneB = t.cookieFor(p);
    await request(t.app).get('/api/auth/me').set('Cookie', phoneB).expect(200);
    await request(t.app).post('/api/auth/logout').set('Cookie', phoneA).expect(204);
    expectError(await request(t.app).get('/api/auth/me').set('Cookie', phoneB), 'INVALID_TOKEN');
  });

  it('a role switched on one phone applies to the other phone too', async () => {
    const t = makeTestApp();
    const both = await makeUser({ isDriver: true, isPassenger: true, lastActiveRole: 'PASSENGER' });
    const phoneB = t.cookieFor(both, 'PASSENGER');
    await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(both, 'PASSENGER')).send({ role: 'DRIVER' }).expect(200);
    expect((await request(t.app).get('/api/auth/me').set('Cookie', phoneB)).body.activeRole).toBe('DRIVER');
  });
});

describe('money', () => {
  it('a locked user cannot withdraw while a driver is still owed', async () => {
    const t = makeTestApp();
    const both = await makeUser({ isDriver: true, isPassenger: true, lastActiveRole: 'DRIVER', accountStatus: 'LOCKED', balanceCents: 500 });
    expectError(await request(t.app).post('/api/wallet/withdraw').set('Cookie', t.cookieFor(both, 'DRIVER')).send({ amountCents: 500 }), 'ACCOUNT_LOCKED');
  });

  it('paying off a debt marks the ride PAID and counts it as a completed ride', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger({ accountStatus: 'LOCKED', completedRides: 3 });
    const j = await makeJourney(d.id, { status: 'COMPLETED' });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
      status: 'COMPLETED',
      pickupStatus: 'UNPAID',
      paymentStatus: 'UNPAID',
      currentFareCents: 300,
    });
    await prisma().booking.update({ where: { id: b.id }, data: { finalFareCents: 300 } });
    await prisma().debt.create({ data: { userId: p.id, bookingId: b.id, amountCents: 70 } });
    await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(p)).send({ amountCents: 100 }).expect(200);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: b.id } })).paymentStatus).toBe('PAID');
    const after = await prisma().user.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.accountStatus).toBe('ACTIVE');
    expect(after.completedRides).toBe(4);
  });

  it('accepting a rider who can no longer pay tells the DRIVER what happened, in words meant for the driver', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger({ balanceCents: 0 });
    const j = await makeJourney(d.id);
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id);
    const res = await request(t.app).post(`/api/bookings/${b.id}/accept`).set('Cookie', t.cookieFor(d));
    const body = expectError(res, 'INSUFFICIENT_BALANCE');
    expect(body.message).toMatch(/This passenger no longer has enough/);
  });
});

describe('live location privacy (FR 7.10)', () => {
  it('a rider marked no-show (or dropped off) cannot join the live location again by reconnecting', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger();
    const j = await makeJourney(d.id, { status: 'IN_PROGRESS', seatsAvailable: 2 });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', pickupStatus: 'PICKED_UP' });
    const loc = new LocationService(t.ctx);
    await expect(loc.assertCanJoin(p.id, j.id)).resolves.toBeUndefined(); // riding: may follow
    for (const s of ['DROPPED_OFF', 'NO_SHOW'] as const) {
      await prisma().booking.update({ where: { id: b.id }, data: { pickupStatus: s } });
      await expect(loc.assertCanJoin(p.id, j.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});

describe('"today" is a Singapore day (UTC+8), not a UTC day', () => {
  it('at 23:30 Singapore time a request for 23:59:59 is today, and one for 00:00 is tomorrow (refused, with the reason)', async () => {
    const t = makeTestApp();
    t.clock.set(new Date('2026-10-19T15:30:00Z')); // 23:30 in Singapore
    const cat = await makeCatalog();
    const ask = (p: { id: string; isDriver: boolean; isPassenger: boolean }, iso: string) =>
      request(t.app)
        .post('/api/hop-requests')
        .set('Cookie', t.cookieFor(p))
        .send({ fromLocationId: cat.hallA.id, toLocationId: cat.mainGate.id, requestedTime: iso });
    const late = await ask(await makePassenger({ balanceCents: 500 }), '2026-10-19T15:59:59Z'); // 23:59:59 SGT, same day
    expect(late.status, JSON.stringify(late.body)).toBe(201);
    const body = expectError(await ask(await makePassenger({ balanceCents: 500 }), '2026-10-19T16:00:00Z'), 'VALIDATION_ERROR'); // 00:00 SGT next day
    expect(body.message).toMatch(/today only/);
  });
});
