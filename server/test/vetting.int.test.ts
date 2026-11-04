/**
 * Independent vetting (4 Nov 2026): one test per bug the other session lists as "known" on the test sheet.
 * Each test asserts the CORRECT behaviour, so a failing test means the bug is real in this snapshot.
 * G5, X1 and F2 are fixed on this branch, so their tests must pass. F2's fix is the fareLock feature flag (on by default); the
 * last test checks that switching it off gives back SRS FR 5.1.3 exactly (the bug returns).
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/core/prisma';
import { makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makePreset, TEST_PASSWORD, TEST_POS } from './helpers';
import { makeTestApp } from './helpers/app';

const pos = (ts: string) => ({ ...TEST_POS.hallA, accuracyM: 10, ts });

async function noShowScenario(fareLock: boolean) {
  const t = makeTestApp();
  t.ctx.flags.fareLock = fareLock;
  const cat = await makeCatalog();
  const d = await makeDriver();
  // Each rider has exactly the $2.00 shared fare, all of it on hold.
  const p1 = await makePassenger({ balanceCents: 200, heldCents: 200 });
  const p2 = await makePassenger({ balanceCents: 200, heldCents: 200 });
  const j = await makeJourney(d.id, { status: 'IN_PROGRESS', seatsAvailable: 1 });
  const mk = (pid: string) =>
    makeBooking(j.id, pid, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
      status: 'CONFIRMED',
      currentFareCents: 200,
      heldCents: 200,
      paymentStatus: 'HELD',
    });
  const b1 = await mk(p1.id);
  const b2 = await mk(p2.id);
  const mark = (id: string, status: string) => request(t.app).post(`/api/bookings/${id}/pickup-status`).set('Cookie', t.cookieFor(d)).send({ status });

  await mark(b2.id, 'ARRIVED').expect(200);
  t.clock.advance(4 * 60_000);
  await mark(b2.id, 'NO_SHOW').expect(200);
  await mark(b1.id, 'PICKED_UP').expect(200);
  await mark(b1.id, 'DROPPED_OFF').expect(200);
  await request(t.app).post(`/api/journeys/${j.id}/complete`).set('Cookie', t.cookieFor(d)).expect(200);

  return {
    debts: await prisma().debt.count({ where: { userId: p1.id } }),
    status: (await prisma().user.findUniqueOrThrow({ where: { id: p1.id } })).accountStatus,
    finalFare: (await prisma().booking.findUniqueOrThrow({ where: { id: b1.id } })).finalFareCents,
    driverBalance: (await prisma().wallet.findUniqueOrThrow({ where: { userId: d.id } })).balanceCents,
  };
}

describe('vetting: known bugs on the test sheet', () => {
  it('G5 / NA-001: three parallel Go Live calls create only ONE live journey', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const preset = await makePreset(d.id, cat.mainGate.id);
    const body = { presetId: preset.id, position: pos(t.clock.now().toISOString()), locationPermission: true };
    const send = () => request(t.app).post('/api/journeys').set('Cookie', t.cookieFor(d)).send(body);
    const codes = (await Promise.all([send(), send(), send()])).map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409]);
    const live = await prisma().journey.count({ where: { driverId: d.id, status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } });
    expect(live).toBe(1);
  });

  it('F2: a co-rider no-show does not push the remaining rider into debt (fareLock on, the default)', async () => {
    const r = await noShowScenario(true);
    expect(r).toEqual({ debts: 0, status: 'ACTIVE', finalFare: 200, driverBalance: 200 });
  });

  it('F2: with fareLock off the SRS rule applies: the fare rises to $3, $1 becomes a debt and the rider is locked', async () => {
    const r = await noShowScenario(false);
    expect(r).toEqual({ debts: 1, status: 'LOCKED', finalFare: 300, driverBalance: 200 });
  });

  it('X1 / NA-012: a live driver who adds the passenger role can still get back to driving after signing in again', async () => {
    const t = makeTestApp();
    const d = await makeDriver(); // holds DRIVER only, never picked a role, so lastActiveRole is null
    await makeJourney(d.id, { status: 'LIVE' });
    await request(t.app).post('/api/me/roles').set('Cookie', t.cookieFor(d)).send({ add: 'PASSENGER' }).expect(200);

    const login = await request(t.app).post('/api/auth/login').send({ ntuEmail: d.ntuEmail, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = String(login.headers['set-cookie']);
    const choose = await request(t.app).post('/api/me/active-role').set('Cookie', cookie).send({ role: 'DRIVER' });
    expect(choose.status, JSON.stringify(choose.body)).toBe(200);
    // Switching to the OTHER role mid-journey is still refused (UC-2.EX.2).
    const other = await request(t.app).post('/api/me/active-role').set('Cookie', cookie).send({ role: 'PASSENGER' });
    expect(other.status).toBe(409);
  });

  it('T5: once the trip has started, the booking says canCancel false even while the rider is still WAITING', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger({ balanceCents: 500, heldCents: 300 });
    const j = await makeJourney(d.id, { status: 'OPEN', seatsAvailable: 2 });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', heldCents: 300, paymentStatus: 'HELD' });
    const get = () => request(t.app).get(`/api/bookings/${b.id}`).set('Cookie', t.cookieFor(p));
    expect((await get()).body.canCancel).toBe(true);
    await prisma().journey.update({ where: { id: j.id }, data: { status: 'IN_PROGRESS' } });
    expect((await get()).body.canCancel).toBe(false);
  });

  it('V-1 (new): one passenger booking two different journeys in parallel gets ONE booking, so cannot end up confirmed in two cars', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const [d1, d2] = [await makeDriver(), await makeDriver()];
    const p = await makePassenger({ balanceCents: 600 });
    const journeys = [await makeJourney(d1.id, { departureTime: t.clock.now() }), await makeJourney(d2.id, { departureTime: t.clock.now() })];
    const book = (journeyId: string) =>
      request(t.app)
        .post('/api/bookings')
        .set('Cookie', t.cookieFor(p))
        .send({ journeyId, pickupPointId: cat.pickup.hallABus.id, dropoffPointId: cat.pickup.gateBus.id });
    const codes = (await Promise.all(journeys.map((j) => book(j.id)))).map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    expect(await prisma().booking.count({ where: { passengerId: p.id, status: { in: ['PENDING', 'CONFIRMED'] } } })).toBe(1);
  });

  it('V-2 (new): going live and booking a ride at the same moment cannot both succeed', async () => {
    for (let round = 0; round < 3; round++) {
      const t = makeTestApp();
      const cat = await makeCatalog();
      const other = await makeDriver();
      const j = await makeJourney(other.id, { departureTime: t.clock.now() });
      const u = await makeDriver({ isPassenger: true, balanceCents: 600 });
      const preset = await makePreset(u.id, cat.mainGate.id);
      const [live, book] = await Promise.all([
        request(t.app)
          .post('/api/journeys')
          .set('Cookie', t.cookieFor(u, 'DRIVER'))
          .send({ presetId: preset.id, position: pos(t.clock.now().toISOString()), locationPermission: true }),
        request(t.app)
          .post('/api/bookings')
          .set('Cookie', t.cookieFor(u, 'PASSENGER'))
          .send({ journeyId: j.id, pickupPointId: cat.pickup.hallABus.id, dropoffPointId: cat.pickup.gateBus.id }),
      ]);
      expect([live.status, book.status].filter((s) => s < 300)).toHaveLength(1);
    }
  });
});
