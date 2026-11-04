/**
 * Tasks B5a (hop requests) and B5b (matching): real PostgreSQL, a clock the test controls. UC-7, UC-8.
 * The synthetic catalog (see test/helpers/dbFactories.ts) puts a driver's route straight north from Hall A to the Main Gate.
 * Hall B's bus stop is about 244 m east of that route, so its detour is 1.5 minutes at 20 km/h.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { minutes } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { HopRequestService } from '../src/services/HopRequestService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makePreset, makeUser } from './helpers';
import { makeTestApp } from './helpers/app';

async function world(shared?: Awaited<ReturnType<typeof makeCatalog>>) {
  const t = makeTestApp();
  const cat = shared ?? (await makeCatalog());
  const driver = await makeDriver();
  const preset = await makePreset(driver.id, cat.mainGate.id, { allowedPickupTypes: ['BUS_STOP', 'CARPARK'], detourToleranceMin: 5 });
  const journey = await makeJourney(driver.id, { presetId: preset.id, departureTime: t.clock.now() });
  const passenger = await makePassenger({ balanceCents: 1000 });
  const ask = (o: Record<string, unknown> = {}, who = passenger, role?: 'PASSENGER' | 'DRIVER') =>
    request(t.app)
      .post('/api/hop-requests')
      .set('Cookie', t.cookieFor(who, role))
      .send({ fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id, ...o });
  return { t, cat, driver, preset, journey, passenger, ask };
}

describe('B5a: posting a hop request (UC-7)', () => {
  it('creates an OPEN request and returns it with its matches', async () => {
    const { ask, journey, cat } = await world();
    const res = await ask();
    expect(res.status).toBe(201);
    expect(res.body.hopRequest).toMatchObject({ status: 'OPEN', fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id });
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].journeyId).toBe(journey.id);
  });

  it('with no journey it stays OPEN and has no matches (UC-7.AC.1)', async () => {
    const { ask, journey } = await world();
    await prisma().journey.update({ where: { id: journey.id }, data: { status: 'CANCELLED', cancelReason: 'DRIVER' } });
    const res = await ask();
    expect(res.status).toBe(201);
    expect(res.body.matches).toEqual([]);
    expect(res.body.hopRequest.status).toBe('OPEN');
  });

  it('a time in the past is VALIDATION_ERROR; a time on another day too; a minute of clock drift is tolerated', async () => {
    const { ask, t } = await world();
    const now = t.clock.now().getTime();
    expectError(await ask({ requestedTime: new Date(now - minutes(10)).toISOString() }), 'VALIDATION_ERROR');
    expectError(await ask({ requestedTime: new Date(now + 24 * 3_600_000).toISOString() }), 'VALIDATION_ERROR');
    expect((await ask({ requestedTime: new Date(now - 20_000).toISOString() })).status).toBe(201);
  });

  it('a later time today is accepted, and refused when the scheduledRequests flag is off', async () => {
    const w0 = await world();
    const { ask, t } = w0;
    const later = new Date(t.clock.now().getTime() + minutes(30)).toISOString();
    expect((await ask({ requestedTime: later })).status).toBe(201);
    const off = await world(w0.cat);
    off.t.ctx.flags.scheduledRequests = false;
    expectError(await off.ask({ requestedTime: later }), 'VALIDATION_ERROR');
  });

  it('same origin and destination -> VALIDATION_ERROR; unknown place -> NOT_FOUND', async () => {
    const { ask, cat } = await world();
    expectError(await ask({ toLocationId: cat.hallB.id }), 'VALIDATION_ERROR');
    expectError(await ask({ toLocationId: 'nowhere' }), 'NOT_FOUND');
  });

  it('a LOCKED passenger is refused with ACCOUNT_LOCKED; an unverified one with EMAIL_NOT_VERIFIED (UC-7.EX.1)', async () => {
    const { ask } = await world();
    expectError(await ask({}, await makePassenger({ accountStatus: 'LOCKED' })), 'ACCOUNT_LOCKED');
    expectError(await ask({}, await makePassenger({ accountStatus: 'PENDING_VERIFICATION' })), 'EMAIL_NOT_VERIFIED');
  });

  it('under $2 available the passenger cannot ask for a ride (INSUFFICIENT_BALANCE) but is NOT locked; exactly $2 is allowed; held money does not count', async () => {
    const { ask } = await world();
    const poor = await makePassenger({ balanceCents: 199 });
    expectError(await ask({}, poor), 'INSUFFICIENT_BALANCE');
    expect((await prisma().user.findUniqueOrThrow({ where: { id: poor.id } })).accountStatus).toBe('ACTIVE');
    expect(await prisma().hopRequest.count()).toBe(0);
    expect((await ask({}, await makePassenger({ balanceCents: 200 }))).status).toBe(201);
    expectError(await ask({}, await makePassenger({ balanceCents: 500, heldCents: 400 })), 'INSUFFICIENT_BALANCE');
  });

  it('a user acting as a driver cannot post a request', async () => {
    const { ask } = await world();
    expectError(await ask({}, await makeDriver()), 'FORBIDDEN');
  });

  it('only one OPEN request at a time (CONFLICT); GET /mine lists it', async () => {
    const { ask, passenger, t } = await world();
    await ask();
    expectError(await ask(), 'CONFLICT');
    const mine = await request(t.app).get('/api/hop-requests/mine').set('Cookie', t.cookieFor(passenger));
    expect(mine.body).toHaveLength(1);
  });

  it('after its window the request is EXPIRED, by the sweep and lazily when its owner asks; then a new one is allowed', async () => {
    const { ask, passenger, t, cat } = await world();
    const first = await ask();
    t.clock.advance(minutes(15) + 1000);
    const mine = await request(t.app).get('/api/hop-requests/mine').set('Cookie', t.cookieFor(passenger));
    expect(mine.body).toEqual([]);
    expect((await prisma().hopRequest.findUniqueOrThrow({ where: { id: first.body.hopRequest.id } })).status).toBe('EXPIRED');
    expect((await ask()).status).toBe(201);

    const swept = await world(cat);
    await swept.ask();
    swept.t.clock.advance(minutes(16));
    expect(await new HopRequestService(swept.t.ctx).expireDue()).toBe(1);
  });
});

describe('B5b: finding journeys for a request (passenger first)', () => {
  it('returns the walking distance, pickup time, driver rating, rider fare and the pickup point (FR 4.3, 4.4)', async () => {
    const { ask, driver, cat, journey } = await world();
    await prisma().user.update({ where: { id: driver.id }, data: { ratingSum: 9, ratingCount: 2 } });
    const m = (await ask()).body.matches[0];
    expect(m).toMatchObject({
      journeyId: journey.id,
      driver: { id: driver.id, avgRating: 4.5, unpaidCount: 0 },
      pickupPoint: { id: cat.pickup.hallBBus.id, type: 'BUS_STOP', walkDistanceM: 60 },
      walkDistanceM: 60,
      fareCents: 300,
    });
    expect(m.detourMin).toBeCloseTo(1.5, 1);
    expect(new Date(m.pickupTime).getTime()).toBeGreaterThanOrEqual(new Date(journey.departureTime).getTime());
  });

  it('the fare shown is what the rider would pay after joining: $2.00 once another rider is confirmed', async () => {
    const { ask, journey, cat } = await world();
    const other = await makePassenger();
    await makeBooking(journey.id, other.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED' });
    expect((await ask()).body.matches[0].fareCents).toBe(200);
  });

  it.each([
    [
      'a FULL journey (no seats)',
      (w: Awaited<ReturnType<typeof world>>) => prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'FULL', seatsAvailable: 0 } }),
    ],
    [
      'a cancelled journey',
      (w: Awaited<ReturnType<typeof world>>) => prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'CANCELLED', cancelReason: 'DRIVER' } }),
    ],
    [
      'a journey already in progress',
      (w: Awaited<ReturnType<typeof world>>) => prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'IN_PROGRESS' } }),
    ],
    ['a journey with no stored route', (w: Awaited<ReturnType<typeof world>>) => prisma().route.delete({ where: { journeyId: w.journey.id } })],
    [
      'a pickup type the preset does not allow',
      (w: Awaited<ReturnType<typeof world>>) => prisma().driverPreset.update({ where: { id: w.preset.id }, data: { allowedPickupTypes: ['CARPARK'] } }),
    ],
    [
      'a detour above the preset tolerance (1 minute < 1.5)',
      (w: Awaited<ReturnType<typeof world>>) => prisma().driverPreset.update({ where: { id: w.preset.id }, data: { detourToleranceMin: 1 } }),
    ],
    [
      'a pickup point too far to walk to (450 m)',
      (w: Awaited<ReturnType<typeof world>>) => prisma().pickupPoint.update({ where: { id: w.cat.pickup.hallBBus.id }, data: { walkDistanceM: 450 } }),
    ],
    [
      'a departure 16 minutes from the requested time',
      (w: Awaited<ReturnType<typeof world>>) =>
        prisma().journey.update({ where: { id: w.journey.id }, data: { departureTime: new Date(w.t.clock.now().getTime() + minutes(16)) } }),
    ],
  ])('each filter rejects on its own: %s', async (_name, breakIt) => {
    const w = await world();
    await breakIt(w);
    const res = await w.ask();
    expect(res.status).toBe(201);
    expect(res.body.matches).toEqual([]);
  });

  it('a departure exactly 15 minutes away still matches (boundary)', async () => {
    const w = await world();
    await prisma().journey.update({ where: { id: w.journey.id }, data: { departureTime: new Date(w.t.clock.now().getTime() + minutes(15)) } });
    expect((await w.ask()).body.matches).toHaveLength(1);
  });

  it("a destination that is not on the driver's way is not matched (Pioneer Gate is about 890 m off the route)", async () => {
    const w = await world();
    expect((await w.ask({ toLocationId: w.cat.pioneerGate.id })).body.matches).toEqual([]);
  });

  it('a journey is not offered to its own driver, nor again to a passenger who already booked it', async () => {
    const w = await world();
    const both = await makeUser({ isDriver: true, isPassenger: true, balanceCents: 500 });
    const own = await makeJourney(both.id, { departureTime: w.t.clock.now() });
    // Since the fullstack review, someone driving a live journey cannot ask for a ride at all (they would ride and drive at once),
    // so their own journey can never be offered to them.
    expect((await w.ask({}, both as never, 'PASSENGER')).body.code).toBe('ILLEGAL_STATE_TRANSITION');

    await makeBooking(w.journey.id, w.passenger.id, w.cat.pickup.hallBBus.id, w.cat.pickup.gateBus.id);
    // the journey the passenger already booked is gone from the list; the other driver's journey (own.id) is still offered
    expect((await w.ask()).body.matches.map((m: { journeyId: string }) => m.journeyId)).toEqual([own.id]);
  });

  it('ranking: less detour first; a driver with unpaid history is pushed back', async () => {
    const w = await world();
    const near = await makeDriver();
    const nearPreset = await makePreset(near.id, w.cat.mainGate.id);
    // a route that passes right by Hall B's bus stop: zero detour
    const nearJourney = await makeJourney(near.id, {
      presetId: nearPreset.id,
      departureTime: w.t.clock.now(),
      from: { lat: 1.0, lng: 103.0022 },
      to: { lat: 1.006, lng: 103.0022 },
    });
    const matches = (await w.ask()).body.matches;
    expect(matches.map((m: { journeyId: string }) => m.journeyId)).toEqual([nearJourney.id, w.journey.id]);

    await prisma().user.update({ where: { id: near.id }, data: { unpaidCount: 3 } });
    const again = await request(w.t.app)
      .get(`/api/hop-requests/${(await prisma().hopRequest.findFirstOrThrow()).id}/matches`)
      .set('Cookie', w.t.cookieFor(w.passenger));
    expect(again.body.map((m: { journeyId: string }) => m.journeyId)).toEqual([w.journey.id, nearJourney.id]);
  });

  it('GET /matches: only the owner; unknown is NOT_FOUND; an expired request has none', async () => {
    const w = await world();
    const created = (await w.ask()).body.hopRequest;
    const url = `/api/hop-requests/${created.id}/matches`;
    expect((await request(w.t.app).get(url).set('Cookie', w.t.cookieFor(w.passenger))).body).toHaveLength(1);
    expectError(
      await request(w.t.app)
        .get(url)
        .set('Cookie', w.t.cookieFor(await makePassenger())),
      'FORBIDDEN',
    );
    expectError(await request(w.t.app).get('/api/hop-requests/nope/matches').set('Cookie', w.t.cookieFor(w.passenger)), 'NOT_FOUND');
    await prisma().hopRequest.update({ where: { id: created.id }, data: { status: 'EXPIRED' } });
    expect((await request(w.t.app).get(url).set('Cookie', w.t.cookieFor(w.passenger))).body).toEqual([]);
  });

  it('nothing in a match response reveals an e-mail address or phone number (NFR-5.2)', async () => {
    const w = await world();
    const text = JSON.stringify((await w.ask()).body);
    expect(text).not.toContain('@');
    expect(text).not.toMatch(/\b\d{8}\b/);
  });
});

describe('B5b: finding requests for a journey (driver first)', () => {
  it('shows an open request as a card, and a pending booking as a card the driver can accept', async () => {
    const w = await world();
    const waiting = await makePassenger({ name: 'Wei Ling Tan', balanceCents: 500 });
    await request(w.t.app)
      .post('/api/hop-requests')
      .set('Cookie', w.t.cookieFor(waiting))
      .send({ fromLocationId: w.cat.hallB.id, toLocationId: w.cat.mainGate.id });
    const booker = await makePassenger({ name: 'Ahmad Bin Ali' });
    const booking = await makeBooking(w.journey.id, booker.id, w.cat.pickup.hallBBus.id, w.cat.pickup.gateBus.id, { currentFareCents: 300 });

    const res = await request(w.t.app).get(`/api/journeys/${w.journey.id}/requests`).set('Cookie', w.t.cookieFor(w.driver));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const pending = res.body.find((c: { bookingId: string | null }) => c.bookingId === booking.id);
    expect(pending.passenger).toMatchObject({ id: booker.id, firstName: 'Ahmad', unpaidCount: 0 });
    expect(pending.fareCentsIfAccepted).toBe(300);
    const open = res.body.find((c: { bookingId: string | null }) => c.bookingId === null);
    expect(open.passenger.firstName).toBe('Wei');
    expect(open.hopRequestId).toBeTruthy();
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('@e.ntu.edu.sg');
  });

  it("a LOCKED passenger's request is not shown to drivers (FR 4.9)", async () => {
    const w = await world();
    const p = await makePassenger({ name: 'Locked Person' });
    await request(w.t.app).post('/api/hop-requests').set('Cookie', w.t.cookieFor(p)).send({ fromLocationId: w.cat.hallB.id, toLocationId: w.cat.mainGate.id });
    await prisma().user.update({ where: { id: p.id }, data: { accountStatus: 'LOCKED' } });
    const res = await request(w.t.app).get(`/api/journeys/${w.journey.id}/requests`).set('Cookie', w.t.cookieFor(w.driver));
    expect(res.body).toEqual([]);
  });

  it("someone else's journey is FORBIDDEN, unknown is NOT_FOUND", async () => {
    const w = await world();
    expectError(
      await request(w.t.app)
        .get(`/api/journeys/${w.journey.id}/requests`)
        .set('Cookie', w.t.cookieFor(await makeDriver())),
      'FORBIDDEN',
    );
    expectError(await request(w.t.app).get('/api/journeys/nope/requests').set('Cookie', w.t.cookieFor(w.driver)), 'NOT_FOUND');
  });

  it('a driver going live tells the passengers who were already waiting (FR 8.11)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const waiting = await makePassenger({ balanceCents: 500 });
    await request(t.app)
      .post('/api/hop-requests')
      .set('Cookie', t.cookieFor(waiting))
      .send({ fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id })
      .expect(201);
    const told: { passengerId: string; journeyId: string }[] = [];
    t.ctx.bus.on('RequestAccepted', (e) => void told.push(e));

    const d = await makeDriver();
    const preset = await makePreset(d.id, cat.mainGate.id);
    const res = await request(t.app)
      .post('/api/journeys')
      .set('Cookie', t.cookieFor(d))
      .send({ presetId: preset.id, position: { lat: 1.0, lng: 103.0, accuracyM: 8, ts: t.clock.now().toISOString() }, locationPermission: true });
    expect(res.status).toBe(201);
    expect(told).toEqual([{ hopRequestId: expect.any(String), passengerId: waiting.id, journeyId: res.body.id }]);
  });
});
