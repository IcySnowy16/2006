/**
 * Tasks B1 (presets, driver profile), B2 (stored route), B3 (go live, cancel), B4 (geofence, expiry): real PostgreSQL,
 * fake Maps, a clock the test controls. UC-3, UC-4, UC-5, UC-6.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DomainEvents } from '../src/events/events';
import { minutes, sgDate } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { GeofenceService } from '../src/services/GeofenceService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makePreset, TEST_POS } from './helpers';
import { makeTestApp } from './helpers/app';

const presetBody = (gateId: string, o: Record<string, unknown> = {}) => ({
  name: 'To the main gate',
  exitGateId: gateId,
  plan: 'SHARING',
  allowedPickupTypes: ['BUS_STOP', 'CARPARK'],
  detourToleranceMin: 5,
  schedule: null,
  exemptionConfirmed: true,
  ...o,
});

const pos = (p: { lat: number; lng: number }, accuracyM = 8) => ({ ...p, accuracyM, ts: '2026-10-19T08:00:00.000Z' });

describe('B1: presets (UC-3)', () => {
  it('creates a preset with the declaration time stored, lists it, edits it', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const cookie = t.cookieFor(d);
    const created = await request(t.app).post('/api/presets').set('Cookie', cookie).send(presetBody(cat.mainGate.id));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'To the main gate',
      plan: 'SHARING',
      exemptionConfirmed: true,
      exemptionConfirmedAt: t.clock.now().toISOString(),
    });

    const list = await request(t.app).get('/api/presets').set('Cookie', cookie);
    expect(list.body).toHaveLength(1);

    t.clock.advance(minutes(5));
    const edited = await request(t.app)
      .put(`/api/presets/${created.body.id}`)
      .set('Cookie', cookie)
      .send(presetBody(cat.mainGate.id, { name: 'Renamed', plan: 'SOLO', schedule: { days: ['MON', 'WED'], departAt: '08:30' } }));
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      name: 'Renamed',
      plan: 'SOLO',
      schedule: { days: ['MON', 'WED'], departAt: '08:30' },
      exemptionConfirmedAt: t.clock.now().toISOString(),
    });
  });

  it('detour tolerance: 5 is fine, 6 and -1 are VALIDATION_ERROR', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const cookie = t.cookieFor(await makeDriver());
    expect(
      (
        await request(t.app)
          .post('/api/presets')
          .set('Cookie', cookie)
          .send(presetBody(cat.mainGate.id, { detourToleranceMin: 5 }))
      ).status,
    ).toBe(201);
    expectError(
      await request(t.app)
        .post('/api/presets')
        .set('Cookie', cookie)
        .send(presetBody(cat.mainGate.id, { detourToleranceMin: 6 })),
      'VALIDATION_ERROR',
    );
    expectError(
      await request(t.app)
        .post('/api/presets')
        .set('Cookie', cookie)
        .send(presetBody(cat.mainGate.id, { detourToleranceMin: -1 })),
      'VALIDATION_ERROR',
    );
  });

  it('refuses a missing declaration, no pickup types, a blank name and an unknown plan', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const cookie = t.cookieFor(await makeDriver());
    for (const bad of [{ exemptionConfirmed: false }, { allowedPickupTypes: [] }, { name: '   ' }, { plan: 'TAXI' }]) {
      expectError(await request(t.app).post('/api/presets').set('Cookie', cookie).send(presetBody(cat.mainGate.id, bad)), 'VALIDATION_ERROR');
    }
    expect(await prisma().driverPreset.count()).toBe(0);
  });

  it('the exit must be a campus gate: a hall is VALIDATION_ERROR, an unknown id is NOT_FOUND', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const cookie = t.cookieFor(await makeDriver());
    expectError(await request(t.app).post('/api/presets').set('Cookie', cookie).send(presetBody(cat.hallA.id)), 'VALIDATION_ERROR');
    expectError(await request(t.app).post('/api/presets').set('Cookie', cookie).send(presetBody('no-such-place')), 'NOT_FOUND');
  });

  it('at most 5 presets per driver', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    for (let i = 0; i < 5; i++) await makePreset(d.id, cat.mainGate.id);
    expectError(await request(t.app).post('/api/presets').set('Cookie', t.cookieFor(d)).send(presetBody(cat.mainGate.id)), 'CONFLICT');
  });

  it("someone else's preset: edit and delete are FORBIDDEN; unknown is NOT_FOUND", async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const owner = await makeDriver();
    const other = await makeDriver();
    const preset = await makePreset(owner.id, cat.mainGate.id);
    const cookie = t.cookieFor(other);
    expectError(await request(t.app).put(`/api/presets/${preset.id}`).set('Cookie', cookie).send(presetBody(cat.mainGate.id)), 'FORBIDDEN');
    expectError(await request(t.app).delete(`/api/presets/${preset.id}`).set('Cookie', cookie), 'FORBIDDEN');
    expectError(await request(t.app).delete('/api/presets/nope').set('Cookie', cookie), 'NOT_FOUND');
  });

  it('delete: refused with PRESET_IN_USE while a journey from it is LIVE, allowed once it is cancelled (UC-3.EX.1)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const preset = await makePreset(d.id, cat.mainGate.id);
    const journey = await makeJourney(d.id, { presetId: preset.id });
    const cookie = t.cookieFor(d);
    expectError(await request(t.app).delete(`/api/presets/${preset.id}`).set('Cookie', cookie), 'PRESET_IN_USE');
    await prisma().journey.update({ where: { id: journey.id }, data: { status: 'CANCELLED', cancelReason: 'DRIVER' } });
    expect((await request(t.app).delete(`/api/presets/${preset.id}`).set('Cookie', cookie)).status).toBe(204);
    expect(await prisma().driverPreset.count()).toBe(0);
  });

  it('a passenger-only user who saves the driver profile gains the DRIVER role; a driver-only user is unaffected (UC-3, FR 1.6)', async () => {
    const t = makeTestApp();
    const p = await makePassenger();
    const body = { vehiclePlate: 'SBA1234A', vehicleModel: 'Toyota Vios', payNowId: '91234567' };
    const res = await request(t.app).put('/api/driver/profile').set('Cookie', t.cookieFor(p)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...body, dailyPaidTrips: 0 });
    const me = await request(t.app).get('/api/auth/me').set('Cookie', t.cookieFor(p));
    expect(me.body.roles).toEqual(['DRIVER', 'PASSENGER']);
    expect(me.body.hasDriverProfile).toBe(true);

    const d = await makeDriver();
    await request(t.app).put('/api/driver/profile').set('Cookie', t.cookieFor(d)).send(body).expect(200);
    expect((await request(t.app).get('/api/auth/me').set('Cookie', t.cookieFor(d))).body.roles).toEqual(['DRIVER']);
  });

  it('a passenger acting as a passenger cannot list presets (driver route)', async () => {
    const t = makeTestApp();
    expectError(
      await request(t.app)
        .get('/api/presets')
        .set('Cookie', t.cookieFor(await makePassenger())),
      'FORBIDDEN',
    );
  });
});

describe('B3: go live (UC-4) and B2: the stored route (UC-6)', () => {
  async function ready(
    o: { dailyPaidTrips?: number; lastPaidTripDate?: string | null; accountStatus?: 'ACTIVE' | 'PENDING_VERIFICATION' } = {},
    shared?: Awaited<ReturnType<typeof makeCatalog>>,
  ) {
    const t = makeTestApp();
    const cat = shared ?? (await makeCatalog());
    const d = await makeDriver(o);
    const preset = await makePreset(d.id, cat.mainGate.id);
    const body = { presetId: preset.id, position: pos(TEST_POS.hallA), locationPermission: true };
    return { t, cat, d, preset, body, cookie: t.cookieFor(d) };
  }

  it('goes LIVE with every seat free, stores the route once and waits LIVE_WINDOW_MIN (SRS Q7)', async () => {
    const { t, body, cookie, d } = await ready();
    const res = await request(t.app).post('/api/journeys').set('Cookie', cookie).send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'LIVE', plan: 'SHARING', seatsAvailable: 3, cancelReason: null, departureTime: t.clock.now().toISOString() });
    expect(res.body.route.polyline).toBeTruthy();
    expect(t.adapters.maps.routeCalls).toHaveLength(1);
    const row = await prisma().journey.findFirstOrThrow({ where: { driverId: d.id }, include: { route: true } });
    expect(row.liveExpiresAt.toISOString()).toBe(new Date(t.clock.now().getTime() + minutes(15)).toISOString());
    expect(row.route?.distanceM).toBeGreaterThan(0);
  });

  it('SOLO gives one seat', async () => {
    const { t, d, cat, cookie } = await ready();
    const solo = await makePreset(d.id, cat.mainGate.id, { plan: 'SOLO' });
    const res = await request(t.app)
      .post('/api/journeys')
      .set('Cookie', cookie)
      .send({ presetId: solo.id, position: pos(TEST_POS.hallA), locationPermission: true });
    expect(res.body.seatsAvailable).toBe(1);
  });

  it('a preset with a schedule later today uses that time; otherwise now', async () => {
    const { t, d, cat, cookie } = await ready();
    // the fake clock says 2026-10-19 08:00Z = 16:00 Singapore, a Monday
    const soon = await makePreset(d.id, cat.mainGate.id, { scheduleDays: ['MON'], scheduleDepartAt: '16:30' });
    const res = await request(t.app)
      .post('/api/journeys')
      .set('Cookie', cookie)
      .send({ presetId: soon.id, position: pos(TEST_POS.hallA), locationPermission: true });
    expect(res.body.departureTime).toBe('2026-10-19T08:30:00.000Z');
  });

  it("no such preset -> NOT_FOUND; someone else's preset -> FORBIDDEN", async () => {
    const { t, body, cookie, cat } = await ready();
    expectError(
      await request(t.app)
        .post('/api/journeys')
        .set('Cookie', cookie)
        .send({ ...body, presetId: 'nope' }),
      'NOT_FOUND',
    );
    const other = await makeDriver();
    const theirs = await makePreset(other.id, cat.mainGate.id);
    expectError(
      await request(t.app)
        .post('/api/journeys')
        .set('Cookie', cookie)
        .send({ ...body, presetId: theirs.id }),
      'FORBIDDEN',
    );
  });

  it('no location permission -> LOCATION_PERMISSION_REQUIRED and no journey', async () => {
    const { t, body, cookie } = await ready();
    expectError(
      await request(t.app)
        .post('/api/journeys')
        .set('Cookie', cookie)
        .send({ ...body, locationPermission: false }),
      'LOCATION_PERMISSION_REQUIRED',
    );
    expect(await prisma().journey.count()).toBe(0);
  });

  it("two paid trips today -> DAILY_TRIP_LIMIT_REACHED; yesterday's two do not count (FR 6.4)", async () => {
    const t0 = makeTestApp();
    const today = sgDate(t0.clock.now());
    const yesterday = sgDate(new Date(t0.clock.now().getTime() - 24 * 3_600_000));
    const blocked = await ready({ dailyPaidTrips: 2, lastPaidTripDate: today });
    expectError(await request(blocked.t.app).post('/api/journeys').set('Cookie', blocked.cookie).send(blocked.body), 'DAILY_TRIP_LIMIT_REACHED');
    const free = await ready({ dailyPaidTrips: 2, lastPaidTripDate: yesterday }, blocked.cat);
    expect((await request(free.t.app).post('/api/journeys').set('Cookie', free.cookie).send(free.body)).status).toBe(201);
  });

  it('Maps down -> EXTERNAL_SERVICE_UNAVAILABLE, no journey row and no route row', async () => {
    const { t, body, cookie } = await ready();
    t.adapters.maps.failNext();
    expectError(await request(t.app).post('/api/journeys').set('Cookie', cookie).send(body), 'EXTERNAL_SERVICE_UNAVAILABLE');
    expect(await prisma().journey.count()).toBe(0);
    expect(await prisma().route.count()).toBe(0);
  });

  it('a second go-live while one is live is refused; an unverified e-mail is refused', async () => {
    const { t, body, cookie, cat } = await ready();
    await request(t.app).post('/api/journeys').set('Cookie', cookie).send(body).expect(201);
    expectError(await request(t.app).post('/api/journeys').set('Cookie', cookie).send(body), 'ILLEGAL_STATE_TRANSITION');
    const u = await ready({ accountStatus: 'PENDING_VERIFICATION' }, cat);
    expectError(await request(u.t.app).post('/api/journeys').set('Cookie', u.cookie).send(u.body), 'EMAIL_NOT_VERIFIED');
  });

  it('a user with no vehicle details cannot go live (FR 1.6)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    await prisma().driverProfile.delete({ where: { userId: d.id } });
    const preset = await makePreset(d.id, cat.mainGate.id);
    expectError(
      await request(t.app)
        .post('/api/journeys')
        .set('Cookie', t.cookieFor(d))
        .send({ presetId: preset.id, position: pos(TEST_POS.hallA), locationPermission: true }),
      'FORBIDDEN',
    );
  });

  it('the same origin and destination within 10 minutes reuse the route (Maps asked once)', async () => {
    const { t, body, cookie, d } = await ready();
    await request(t.app).post('/api/journeys').set('Cookie', cookie).send(body).expect(201);
    const first = await prisma().journey.findFirstOrThrow({ where: { driverId: d.id } });
    await request(t.app).post(`/api/journeys/${first.id}/cancel`).set('Cookie', cookie).expect(200);
    t.clock.advance(minutes(3));
    await request(t.app)
      .post('/api/journeys')
      .set('Cookie', cookie)
      .send({ ...body, position: pos(TEST_POS.hallA) })
      .expect(201);
    expect(t.adapters.maps.routeCalls).toHaveLength(1);
  });

  it('GET /api/journeys/mine lists my journeys, newest first', async () => {
    const { t, cookie, d } = await ready();
    await makeJourney(d.id, { status: 'COMPLETED' });
    const res = await request(t.app).get('/api/journeys/mine').set('Cookie', cookie);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('COMPLETED');
  });
});

describe('B3: cancel journey (UC-5)', () => {
  it('cancels the journey, cancels both confirmed bookings, releases both holds and emits JourneyCancelled once', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const journey = await makeJourney(d.id, { status: 'OPEN', seatsAvailable: 1 });
    const a = await makePassenger({ balanceCents: 1000, heldCents: 200 });
    const b = await makePassenger({ balanceCents: 1000, heldCents: 200 });
    await makeBooking(journey.id, a.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', currentFareCents: 200, heldCents: 200 });
    await makeBooking(journey.id, b.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', currentFareCents: 200, heldCents: 200 });
    const cancelled: DomainEvents['JourneyCancelled'][] = [];
    t.ctx.bus.on('JourneyCancelled', (e) => void cancelled.push(e));

    const res = await request(t.app).post(`/api/journeys/${journey.id}/cancel`).set('Cookie', t.cookieFor(d));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'DRIVER' });
    expect(await prisma().booking.count({ where: { journeyId: journey.id, status: 'CANCELLED' } })).toBe(2);
    for (const u of [a, b]) expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: u.id } })).heldCents).toBe(0);
    expect(await prisma().walletTransaction.count({ where: { type: 'RELEASE' } })).toBe(2);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.passengerIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('cancel while IN_PROGRESS -> ILLEGAL_STATE_TRANSITION and nothing changes; COMPLETED too', async () => {
    const t = makeTestApp();
    const d = await makeDriver();
    const running = await makeJourney(d.id, { status: 'IN_PROGRESS' });
    expectError(await request(t.app).post(`/api/journeys/${running.id}/cancel`).set('Cookie', t.cookieFor(d)), 'ILLEGAL_STATE_TRANSITION');
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: running.id } })).status).toBe('IN_PROGRESS');
  });

  it("someone else's journey -> FORBIDDEN; unknown -> NOT_FOUND", async () => {
    const t = makeTestApp();
    const owner = await makeDriver();
    const other = await makeDriver();
    const j = await makeJourney(owner.id);
    expectError(await request(t.app).post(`/api/journeys/${j.id}/cancel`).set('Cookie', t.cookieFor(other)), 'FORBIDDEN');
    expectError(await request(t.app).post('/api/journeys/nope/cancel').set('Cookie', t.cookieFor(owner)), 'NOT_FOUND');
  });

  it('a pending booking is cancelled too (no hold to release)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const j = await makeJourney(d.id);
    const p = await makePassenger({ balanceCents: 500 });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id);
    await request(t.app).post(`/api/journeys/${j.id}/cancel`).set('Cookie', t.cookieFor(d)).expect(200);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED');
  });
});

describe('B4: geofence (UC-5.EX.1, SRS Q12 defaults: 200 m margin, two readings in a row)', () => {
  function withBoundary() {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'boundary-')), 'boundary.json');
    writeFileSync(file, JSON.stringify(TEST_POS.boundary));
    return makeTestApp({ CAMPUS_BOUNDARY: file });
  }
  const post = (t: ReturnType<typeof makeTestApp>, cookie: string, id: string, p: { lat: number; lng: number }, acc = 8) =>
    request(t.app).post(`/api/journeys/${id}/position`).set('Cookie', cookie).send(pos(p, acc));

  // The synthetic square's top edge is lat 1.02. 0.0015 deg is about 167 m, 0.0025 deg about 278 m.
  const INSIDE = { lat: 1.0, lng: 103.0 };
  const IN_MARGIN = { lat: 1.0215, lng: 103.0 };
  const OUTSIDE = { lat: 1.0225, lng: 103.0 };

  it('inside, then inside the margin: never counted; outside once: not cancelled; outside twice in a row: cancelled with reason GEOFENCE', async () => {
    const t = withBoundary();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'OPEN' });
    const cookie = t.cookieFor(d);
    await post(t, cookie, j.id, INSIDE).then((r) => expect(r.status).toBe(204));
    await post(t, cookie, j.id, IN_MARGIN);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).outsideReadings).toBe(0);
    await post(t, cookie, j.id, OUTSIDE);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).toMatchObject({ status: 'OPEN', outsideReadings: 1 });
    await post(t, cookie, j.id, OUTSIDE);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).toMatchObject({ status: 'CANCELLED', cancelReason: 'GEOFENCE' });
  });

  it('a reading back inside resets the count, so one bad fix between two good ones never cancels', async () => {
    const t = withBoundary();
    const d = await makeDriver();
    const j = await makeJourney(d.id);
    const cookie = t.cookieFor(d);
    await post(t, cookie, j.id, OUTSIDE);
    await post(t, cookie, j.id, INSIDE);
    await post(t, cookie, j.id, OUTSIDE);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('LIVE');
  });

  it('a very inaccurate fix proves nothing and is ignored', async () => {
    const t = withBoundary();
    const d = await makeDriver();
    const j = await makeJourney(d.id);
    const cookie = t.cookieFor(d);
    await post(t, cookie, j.id, OUTSIDE, 900);
    await post(t, cookie, j.id, OUTSIDE, 900);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).toMatchObject({ status: 'LIVE', outsideReadings: 0 });
  });

  it('a journey already IN_PROGRESS is never cancelled by a position', async () => {
    const t = withBoundary();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'IN_PROGRESS' });
    const cookie = t.cookieFor(d);
    await post(t, cookie, j.id, OUTSIDE);
    await post(t, cookie, j.id, OUTSIDE);
    await post(t, cookie, j.id, OUTSIDE);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('IN_PROGRESS');
  });

  it('cancelling by geofence notifies everyone and releases holds exactly like a driver cancel', async () => {
    const t = withBoundary();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'OPEN' });
    const p = await makePassenger({ balanceCents: 500, heldCents: 300 });
    await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', heldCents: 300 });
    const seen: DomainEvents['JourneyCancelled'][] = [];
    t.ctx.bus.on('JourneyCancelled', (e) => void seen.push(e));
    const cookie = t.cookieFor(d);
    await post(t, cookie, j.id, OUTSIDE);
    await post(t, cookie, j.id, OUTSIDE);
    expect(seen).toEqual([{ journeyId: j.id, driverId: d.id, reason: 'GEOFENCE', passengerIds: [p.id] }]);
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: p.id } })).heldCents).toBe(0);
  });

  it("someone else's journey -> FORBIDDEN; unknown -> NOT_FOUND", async () => {
    const t = withBoundary();
    const owner = await makeDriver();
    const j = await makeJourney(owner.id);
    expectError(await post(t, t.cookieFor(await makeDriver()), j.id, INSIDE), 'FORBIDDEN');
    expectError(await post(t, t.cookieFor(owner), 'nope', INSIDE), 'NOT_FOUND');
  });

  it('with no boundary configured the geofence is off: nothing is ever cancelled', async () => {
    const t = makeTestApp();
    const d = await makeDriver();
    const j = await makeJourney(d.id);
    const cookie = t.cookieFor(d);
    for (let i = 0; i < 3; i++) await post(t, cookie, j.id, { lat: 40, lng: 100 });
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('LIVE');
  });

  it('isOutside: inside the polygon, inside the margin and beyond the margin', () => {
    const t = makeTestApp();
    const g = new GeofenceService(t.ctx, TEST_POS.boundary);
    expect(g.isOutside(INSIDE)).toBe(false);
    expect(g.isOutside(IN_MARGIN)).toBe(false);
    expect(g.isOutside(OUTSIDE)).toBe(true);
  });

  it('a bad boundary file stops startup with a message that names CAMPUS_BOUNDARY', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'boundary-')), 'bad.json');
    writeFileSync(file, '[{"lat": 1, "lng": 2}]');
    expect(() => makeTestApp({ CAMPUS_BOUNDARY: file })).toThrowError(/CAMPUS_BOUNDARY/);
  });
});

describe('B4: expiry (UC-5.EX.2, FR 3.5, SRS Q7 default: 15 minutes)', () => {
  it('just before the window nothing happens; just after, a LIVE journey with no confirmed booking is EXPIRED and the driver is told', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { departureTime: t.clock.now() });
    const p = await makePassenger({ balanceCents: 500 });
    const pending = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id);
    const expired: string[] = [];
    t.ctx.bus.on('JourneyExpired', (e) => void expired.push(e.journeyId));
    const g = new GeofenceService(t.ctx);

    t.clock.advance(minutes(15) - 1000);
    expect(await g.expireDue()).toEqual([]);
    t.clock.advance(2000);
    expect(await g.expireDue()).toEqual([j.id]);
    expect(await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).toMatchObject({ status: 'EXPIRED', cancelReason: 'EXPIRED' });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
    expect(expired).toEqual([j.id]);
    expect(await g.expireDue()).toEqual([]); // idempotent
  });

  it('a LIVE journey with a CONFIRMED booking does not expire; an OPEN one is never expired', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const withBooking = await makeJourney(d.id, { departureTime: t.clock.now() });
    const p = await makePassenger({ balanceCents: 500 });
    await makeBooking(withBooking.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED' });
    const open = await makeJourney((await makeDriver()).id, { status: 'OPEN', departureTime: t.clock.now() });
    t.clock.advance(minutes(30));
    expect(await new GeofenceService(t.ctx).expireDue()).toEqual([]);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: open.id } })).status).toBe('OPEN');
  });
});
