/**
 * Task Q3 (second part): one test for EVERY error code a route can return. The table is driven by ERROR_CODES, so a code added to the
 * catalog without a case here fails the "no code is missing" test. Each case provokes the code through the real routes and asserts the
 * catalog's HTTP status and the standard error body (code, message, request id in the body and in the header).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, type ErrorCode } from '@campus-hop/shared';
import { WalletService } from '../src/services/WalletService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makePreset } from './helpers';
import { makeTestApp, type TestApp } from './helpers/app';

const here = { lat: 1.0, lng: 103.0 };
const fix = (t: TestApp) => ({ ...here, accuracyM: 8, ts: t.clock.now().toISOString() });
const live = (t: TestApp, presetId: string, o: Record<string, unknown> = {}) => ({ presetId, position: fix(t), locationPermission: true, ...o });
const registerBody = (email: string) => ({ name: 'Err Case', ntuEmail: email, phone: '81234567', password: 'correct-horse-battery', role: 'PASSENGER' });

type Case = (t: TestApp) => Promise<request.Response>;

/** Codes no HTTP route can return: the socket gateway raises it (tested in realtime.int.test.ts, "TRIP_NOT_ACTIVE"). */
const SOCKET_ONLY: ErrorCode[] = ['TRIP_NOT_ACTIVE'];

const CASES: Partial<Record<ErrorCode, Case>> = {
  VALIDATION_ERROR: (t) => request(t.app).post('/api/auth/register').send({}),
  INVALID_JSON: (t) => request(t.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"ntuEmail": '),
  PAYLOAD_TOO_LARGE: (t) =>
    request(t.app)
      .post('/api/auth/login')
      .send({ ntuEmail: 'a@e.ntu.edu.sg', password: 'x'.repeat(200_000) }),
  EMAIL_DOMAIN_NOT_ALLOWED: (t) => request(t.app).post('/api/auth/register').send(registerBody('someone@gmail.com')),
  EMAIL_TAKEN: async (t) => {
    await request(t.app).post('/api/auth/register').send(registerBody('twice@e.ntu.edu.sg')).expect(201);
    return request(t.app).post('/api/auth/register').send(registerBody('twice@e.ntu.edu.sg'));
  },
  VERIFICATION_CODE_INVALID: async (t) => {
    await request(t.app).post('/api/auth/register').send(registerBody('wrong@e.ntu.edu.sg')).expect(201);
    return request(t.app).post('/api/auth/verify').send({ ntuEmail: 'wrong@e.ntu.edu.sg', code: '000000' });
  },
  CODE_ATTEMPTS_EXCEEDED: async (t) => {
    await request(t.app).post('/api/auth/register').send(registerBody('attempts@e.ntu.edu.sg')).expect(201);
    let last = await request(t.app).post('/api/auth/verify').send({ ntuEmail: 'attempts@e.ntu.edu.sg', code: '000000' });
    for (let i = 0; i < 3 && last.body.code !== 'CODE_ATTEMPTS_EXCEEDED'; i++)
      last = await request(t.app).post('/api/auth/verify').send({ ntuEmail: 'attempts@e.ntu.edu.sg', code: '000000' });
    return last;
  },
  INVALID_CREDENTIALS: (t) => request(t.app).post('/api/auth/login').send({ ntuEmail: 'nobody@e.ntu.edu.sg', password: 'wrong-password' }),
  AUTH_REQUIRED: (t) => request(t.app).get('/api/wallet'),
  INVALID_TOKEN: (t) => request(t.app).get('/api/wallet').set('Cookie', 'campus_hop_session=not.a.jwt'),
  TOO_MANY_REQUESTS: async (t) => {
    let last = await request(t.app).post('/api/auth/login').send({ ntuEmail: 'a@e.ntu.edu.sg', password: 'x' });
    for (let i = 0; i < 12; i++) last = await request(t.app).post('/api/auth/login').send({ ntuEmail: 'a@e.ntu.edu.sg', password: 'x' });
    return last;
  },
  FORBIDDEN: async (t) =>
    request(t.app)
      .get('/api/presets')
      .set('Cookie', t.cookieFor(await makePassenger())),
  ACCOUNT_LOCKED: async (t) => {
    const cat = await makeCatalog();
    return request(t.app)
      .post('/api/hop-requests')
      .set('Cookie', t.cookieFor(await makePassenger({ accountStatus: 'LOCKED' })))
      .send({ fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id });
  },
  EMAIL_NOT_VERIFIED: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver({ accountStatus: 'PENDING_VERIFICATION' });
    return request(t.app)
      .post('/api/journeys')
      .set('Cookie', t.cookieFor(d))
      .send(live(t, (await makePreset(d.id, cat.mainGate.id)).id));
  },
  LOCATION_PERMISSION_REQUIRED: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver();
    return request(t.app)
      .post('/api/journeys')
      .set('Cookie', t.cookieFor(d))
      .send(live(t, (await makePreset(d.id, cat.mainGate.id)).id, { locationPermission: false }));
  },
  DAILY_TRIP_LIMIT_REACHED: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver({ dailyPaidTrips: 2, lastPaidTripDate: '2026-10-19' });
    return request(t.app)
      .post('/api/journeys')
      .set('Cookie', t.cookieFor(d))
      .send(live(t, (await makePreset(d.id, cat.mainGate.id)).id));
  },
  NOT_FOUND: async (t) =>
    request(t.app)
      .get('/api/bookings/no-such-booking')
      .set('Cookie', t.cookieFor(await makePassenger())),
  CONFLICT: async (t) => {
    const cat = await makeCatalog();
    const p = await makePassenger({ balanceCents: 500 });
    const ask = () =>
      request(t.app).post('/api/hop-requests').set('Cookie', t.cookieFor(p)).send({ fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id });
    await ask().expect(201);
    return ask();
  },
  SEAT_UNAVAILABLE: async (t) => {
    const cat = await makeCatalog();
    const j = await makeJourney((await makeDriver()).id, { status: 'FULL', seatsAvailable: 0 });
    return request(t.app)
      .post('/api/bookings')
      .set('Cookie', t.cookieFor(await makePassenger({ balanceCents: 500 })))
      .send({ journeyId: j.id, pickupPointId: cat.pickup.hallBBus.id, dropoffPointId: cat.pickup.gateBus.id });
  },
  ILLEGAL_STATE_TRANSITION: async (t) => {
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'IN_PROGRESS' });
    return request(t.app).post(`/api/journeys/${j.id}/cancel`).set('Cookie', t.cookieFor(d));
  },
  PRESET_IN_USE: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver();
    const preset = await makePreset(d.id, cat.mainGate.id);
    await makeJourney(d.id, { presetId: preset.id });
    return request(t.app).delete(`/api/presets/${preset.id}`).set('Cookie', t.cookieFor(d));
  },
  UNRESOLVED_BOOKINGS: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'IN_PROGRESS' });
    await makeBooking(j.id, (await makePassenger()).id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', pickupStatus: 'PICKED_UP' });
    return request(t.app).post(`/api/journeys/${j.id}/complete`).set('Cookie', t.cookieFor(d));
  },
  ALREADY_RATED: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'COMPLETED' });
    const p = await makePassenger();
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'COMPLETED', pickupStatus: 'DROPPED_OFF' });
    const rate = () => request(t.app).post(`/api/bookings/${b.id}/ratings`).set('Cookie', t.cookieFor(p)).send({ stars: 5 });
    await rate().expect(204);
    return rate();
  },
  INSUFFICIENT_BALANCE: async (t) => {
    const cat = await makeCatalog();
    const j = await makeJourney((await makeDriver()).id);
    return request(t.app)
      .post('/api/bookings')
      .set('Cookie', t.cookieFor(await makePassenger({ balanceCents: 50 })))
      .send({ journeyId: j.id, pickupPointId: cat.pickup.hallBBus.id, dropoffPointId: cat.pickup.gateBus.id });
  },
  NOT_IMPLEMENTED: async (t) => {
    t.ctx.flags.withdrawals = false;
    return request(t.app)
      .post('/api/wallet/withdraw')
      .set('Cookie', t.cookieFor(await makeDriver({ balanceCents: 500 })))
      .send({ amountCents: 100 });
  },
  EXTERNAL_SERVICE_UNAVAILABLE: async (t) => {
    const cat = await makeCatalog();
    const d = await makeDriver();
    const preset = await makePreset(d.id, cat.mainGate.id);
    t.adapters.maps.failNext();
    return request(t.app).post('/api/journeys').set('Cookie', t.cookieFor(d)).send(live(t, preset.id));
  },
  INTERNAL_ERROR: async (t) => {
    const spy = vi.spyOn(WalletService.prototype, 'getWallet').mockRejectedValueOnce(new Error('simulated bug with a secret inside: hunter2'));
    try {
      const res = await request(t.app)
        .get('/api/wallet')
        .set('Cookie', t.cookieFor(await makePassenger()));
      expect(JSON.stringify(res.body)).not.toContain('hunter2'); // the real cause never reaches the client
      return res;
    } finally {
      spy.mockRestore();
    }
  },
};

describe('Q3: every error code a route can return', () => {
  it('has a case for every code in the catalog (a new code without a test fails here)', () => {
    const missing = ERROR_CODES.filter((c) => !CASES[c] && !SOCKET_ONLY.includes(c));
    expect(missing).toEqual([]);
  });

  it.each(ERROR_CODES.filter((c) => CASES[c]).map((c) => [c] as const))('%s: catalog status and the standard body', async (code) => {
    const t = makeTestApp();
    const res = await CASES[code]!(t);
    expectError(res, code);
  });

  it('an unknown URL is the same shape (NOT_FOUND), not an HTML page', async () => {
    const t = makeTestApp();
    expectError(await request(t.app).get('/api/no/such/route'), 'NOT_FOUND');
  });

  it('TRIP_NOT_ACTIVE is raised by the socket gateway only and is covered in realtime.int.test.ts', () => {
    expect(SOCKET_ONLY).toEqual(['TRIP_NOT_ACTIVE']);
    expect(readFileSync(path.join(__dirname, 'realtime.int.test.ts'), 'utf8')).toContain("code: 'TRIP_NOT_ACTIVE'");
  });
});
