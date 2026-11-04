/**
 * Tasks F8 (middleware) and A6 (roles): who may call what, by the ACTIVE role (FR 1.7, 1.8), and the rules for choosing,
 * switching and adding roles. Real PostgreSQL, fake adapters.
 */
import cookieParser from 'cookie-parser';
import express from 'express';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { createErrorHandler } from '../src/middleware/errorHandler';
import { assertOwner } from '../src/middleware/ownership';
import { requireAuth } from '../src/middleware/requireAuth';
import { requireAnyRole, requireRole } from '../src/middleware/requireRole';
import { requireUnlocked, requireVerified } from '../src/middleware/requireUnlocked';
import { validate } from '../src/middleware/validate';
import { minutes } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { AppError } from '../src/errors/AppError';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makeUser } from './helpers';
import { makeTestApp, type TestApp } from './helpers/app';

/** A small app with one fake route per middleware, so each is tested on its own. */
function middlewareApp(t: TestApp) {
  const app = express();
  app.use(cookieParser(), express.json());
  const auth = requireAuth(t.ctx);
  app.get('/any', auth, requireAnyRole, (req, res) => res.json({ id: req.user!.id, activeRole: req.user!.activeRole }));
  app.get('/driver', auth, requireRole('DRIVER'), (_req, res) => res.json({ ok: true }));
  app.get('/passenger', auth, requireRole('PASSENGER'), (_req, res) => res.json({ ok: true }));
  app.post('/book', auth, requireUnlocked, (_req, res) => res.json({ ok: true }));
  app.post('/live', auth, requireVerified, (_req, res) => res.json({ ok: true }));
  app.get('/owned/:ownerId', auth, (req, res) => {
    assertOwner(String(req.params.ownerId), req.user!.id);
    res.json({ ok: true });
  });
  app.post('/body', validate({ body: z.object({ n: z.number().int().min(1) }) }), (req, res) => res.json(req.valid?.body));
  app.use(createErrorHandler());
  return app;
}

describe('F8: requireAuth', () => {
  it('sets req.user from the database: id, roles, active role and account status', async () => {
    const t = makeTestApp();
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const res = await request(middlewareApp(t)).get('/any').set('Cookie', t.cookieFor(u, 'DRIVER'));
    expect(res.body).toEqual({ id: u.id, activeRole: 'DRIVER' });
  });

  it('a role in the token that the user does not hold is ignored (no privilege from a stale token)', async () => {
    const t = makeTestApp();
    const u = await makeUser({ isDriver: false, isPassenger: true });
    const forged = t.cookieFor({ ...u, isDriver: true }, 'DRIVER'); // a token that claims DRIVER
    const res = await request(middlewareApp(t)).get('/driver').set('Cookie', forged);
    expectError(res, 'FORBIDDEN');
  });

  it('no cookie and a bad cookie', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    expectError(await request(app).get('/any'), 'AUTH_REQUIRED');
    expectError(await request(app).get('/any').set('Cookie', 'campus_hop_session=not.a.jwt'), 'INVALID_TOKEN');
  });
});

describe('F8: requireRole checks the ACTIVE role, not just the roles held', () => {
  it('a BOTH user acting as a passenger is refused on a driver route and allowed on a passenger route', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const asPassenger = t.cookieFor(u, 'PASSENGER');
    expectError(await request(app).get('/driver').set('Cookie', asPassenger), 'FORBIDDEN');
    expect((await request(app).get('/passenger').set('Cookie', asPassenger)).status).toBe(200);
  });

  it('acting as a driver the reverse', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const asDriver = t.cookieFor(u, 'DRIVER');
    expect((await request(app).get('/driver').set('Cookie', asDriver)).status).toBe(200);
    expectError(await request(app).get('/passenger').set('Cookie', asDriver), 'FORBIDDEN');
  });

  it('a user who has not chosen yet (activeRole null) is refused on both, but allowed on a role-neutral route', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const none = t.cookieFor(u, null);
    expectError(await request(app).get('/driver').set('Cookie', none), 'FORBIDDEN');
    expectError(await request(app).get('/passenger').set('Cookie', none), 'FORBIDDEN');
    expect((await request(app).get('/any').set('Cookie', none)).status).toBe(200);
  });

  it("a single-role user is refused on the other role's routes", async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const p = await makePassenger();
    const d = await makeDriver();
    expectError(await request(app).get('/driver').set('Cookie', t.cookieFor(p)), 'FORBIDDEN');
    expectError(await request(app).get('/passenger').set('Cookie', t.cookieFor(d)), 'FORBIDDEN');
  });
});

describe('F8: requireUnlocked, requireVerified, assertOwner, validate', () => {
  it('FR 10.8: a LOCKED account is ACCOUNT_LOCKED on a booking route but not on a role-neutral one', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const u = await makeUser({ accountStatus: 'LOCKED' });
    expectError(await request(app).post('/book').set('Cookie', t.cookieFor(u)), 'ACCOUNT_LOCKED');
    expect((await request(app).get('/any').set('Cookie', t.cookieFor(u))).status).toBe(200);
  });

  it('NFR-2.1: an unverified account is EMAIL_NOT_VERIFIED where verification is required', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const u = await makeUser({ accountStatus: 'PENDING_VERIFICATION' });
    expectError(await request(app).post('/live').set('Cookie', t.cookieFor(u)), 'EMAIL_NOT_VERIFIED');
    const ok = await makeUser();
    expect((await request(app).post('/live').set('Cookie', t.cookieFor(ok))).status).toBe(200);
  });

  it("assertOwner raises FORBIDDEN for somebody else's resource", async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const me = await makeUser();
    const other = await makeUser();
    expect((await request(app).get(`/owned/${me.id}`).set('Cookie', t.cookieFor(me))).status).toBe(200);
    expectError(await request(app).get(`/owned/${other.id}`).set('Cookie', t.cookieFor(me)), 'FORBIDDEN');
    expect(() => assertOwner('a', 'b')).toThrow(AppError);
  });

  it('validate: a bad body is VALIDATION_ERROR listing the failing field; a good one reaches req.valid', async () => {
    const t = makeTestApp();
    const app = middlewareApp(t);
    const bad = await request(app).post('/body').send({ n: 0 });
    expect(expectError(bad, 'VALIDATION_ERROR').details).toEqual([expect.objectContaining({ path: 'n' })]);
    expect((await request(app).post('/body').send({ n: 3 })).body).toEqual({ n: 3 });
  });
});

describe('A6: active role', () => {
  it('a single-role user: choosing the other role is FORBIDDEN', async () => {
    const t = makeTestApp();
    const u = await makePassenger();
    const res = await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(u)).send({ role: 'DRIVER' });
    expectError(res, 'FORBIDDEN');
  });

  it('a both-role user chooses once; the choice is remembered, reissues the cookie, and is restored at the next login', async () => {
    const t = makeTestApp();
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const res = await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(u, null)).send({ role: 'DRIVER' });
    expect(res.status).toBe(200);
    expect(res.body.activeRole).toBe('DRIVER');
    expect(String(res.headers['set-cookie'])).toContain('campus_hop_session=');
    expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).lastActiveRole).toBe('DRIVER');
    const login = await request(t.app).post('/api/auth/login').send({ ntuEmail: u.ntuEmail, password: 'correct-horse-battery' });
    expect(login.body.activeRole).toBe('DRIVER');
  });

  it('UC-2.EX.2: a driver with a LIVE journey cannot switch; after the journey is cancelled they can', async () => {
    const t = makeTestApp();
    const u = await makeUser({ isDriver: true, isPassenger: true });
    await prisma().driverProfile.create({ data: { userId: u.id, vehiclePlate: 'SBA1234A', vehicleModel: 'Vios', payNowId: '91234567' } });
    const journey = await makeJourney(u.id, { status: 'LIVE' });
    const asDriver = t.cookieFor(u, 'DRIVER');
    expectError(await request(t.app).post('/api/me/active-role').set('Cookie', asDriver).send({ role: 'PASSENGER' }), 'ILLEGAL_STATE_TRANSITION');
    await prisma().journey.update({ where: { id: journey.id }, data: { status: 'CANCELLED', cancelReason: 'DRIVER' } });
    expect((await request(t.app).post('/api/me/active-role').set('Cookie', asDriver).send({ role: 'PASSENGER' })).status).toBe(200);
  });

  it('a passenger with a CONFIRMED booking on an OPEN journey cannot switch to driver', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const driver = await makeDriver();
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const journey = await makeJourney(driver.id, { status: 'OPEN', seatsAvailable: 2 });
    await makeBooking(journey.id, u.id, cat.pickup.hallABus.id, cat.pickup.nieCarpark.id, { status: 'CONFIRMED' });
    expectError(
      await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(u, 'PASSENGER')).send({ role: 'DRIVER' }),
      'ILLEGAL_STATE_TRANSITION',
    );
  });

  // Changed after the fullstack review (19 Oct 2026): a PENDING booking may be accepted after the switch, leaving the user riding and
  // driving at once, so it now blocks the switch like a CONFIRMED one.
  it('a PENDING booking blocks a switch too', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const driver = await makeDriver();
    const u = await makeUser({ isDriver: true, isPassenger: true });
    const journey = await makeJourney(driver.id, { status: 'OPEN', seatsAvailable: 2 });
    await makeBooking(journey.id, u.id, cat.pickup.hallABus.id, cat.pickup.nieCarpark.id, { status: 'PENDING' });
    expectError(
      await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(u, 'PASSENGER')).send({ role: 'DRIVER' }),
      'ILLEGAL_STATE_TRANSITION',
    );
  });

  it('choosing the role you are already in is allowed even mid-trip', async () => {
    const t = makeTestApp();
    const u = await makeUser({ isDriver: true, isPassenger: true });
    await makeJourney(u.id, { status: 'IN_PROGRESS' });
    expect((await request(t.app).post('/api/me/active-role').set('Cookie', t.cookieFor(u, 'DRIVER')).send({ role: 'DRIVER' })).status).toBe(200);
  });

  it('adding the passenger role to a driver-only user: roles updated, wallet kept; adding it twice is CONFLICT', async () => {
    const t = makeTestApp();
    const d = await makeDriver({ balanceCents: 500 });
    const res = await request(t.app).post('/api/me/roles').set('Cookie', t.cookieFor(d)).send({ add: 'PASSENGER' });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['DRIVER', 'PASSENGER']);
    expect(res.body.wallet.balanceCents).toBe(500);
    expectError(await request(t.app).post('/api/me/roles').set('Cookie', t.cookieFor(d, 'DRIVER')).send({ add: 'PASSENGER' }), 'CONFLICT');
  });

  it('adding DRIVER here is VALIDATION_ERROR (a passenger becomes a driver by saving a vehicle, UC-3)', async () => {
    const t = makeTestApp();
    const p = await makePassenger();
    expectError(await request(t.app).post('/api/me/roles').set('Cookie', t.cookieFor(p)).send({ add: 'DRIVER' }), 'VALIDATION_ERROR');
  });

  it('a signed-out request is AUTH_REQUIRED', async () => {
    const t = makeTestApp();
    expectError(await request(t.app).post('/api/me/active-role').send({ role: 'DRIVER' }), 'AUTH_REQUIRED');
  });
});

describe('F15: routes nobody has built yet answer 501 in the standard shape', () => {
  it('an unbuilt route behind the role check is NOT_IMPLEMENTED, and the role check still applies', async () => {
    const t = makeTestApp();
    const passenger = await makePassenger();
    const driver = await makeDriver();
    // Whatever is built by now, the order is: sign-in, then role, then the handler.
    expectError(await request(t.app).get('/api/presets'), 'AUTH_REQUIRED');
    expectError(await request(t.app).get('/api/presets').set('Cookie', t.cookieFor(passenger)), 'FORBIDDEN');
    const res = await request(t.app).get('/api/presets').set('Cookie', t.cookieFor(driver));
    expect([200, 501]).toContain(res.status);
  });

  it('the clock moves the session expiry, not the wall clock', async () => {
    const t = makeTestApp();
    const u = await makeUser();
    const cookie = t.cookieFor(u);
    t.clock.advance(minutes(60 * 24 * 6));
    expect((await request(t.app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
  });
});
