/**
 * Independent vetting (4 Nov 2026): one test per bug the other session lists as "known" on the test sheet.
 * Each test asserts the CORRECT behaviour, so a failing test means the bug is real in this snapshot.
 * G5 and X1 are fixed on this branch, so their tests must pass. F2 is a pricing-policy decision the team has not made yet, so its
 * test is `it.fails` (it passes while the bug is there); remove `.fails` once the fare rule changes.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/core/prisma';
import { makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makePreset, TEST_PASSWORD, TEST_POS } from './helpers';
import { makeTestApp } from './helpers/app';

const pos = (ts: string) => ({ ...TEST_POS.hallA, accuracyM: 10, ts });

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

  it.fails('F2: a co-rider no-show must not push the remaining rider into debt and lock them', async () => {
    const t = makeTestApp();
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

    const user1 = await prisma().user.findUniqueOrThrow({ where: { id: p1.id } });
    expect(await prisma().debt.count({ where: { userId: p1.id } })).toBe(0);
    expect(user1.accountStatus).not.toBe('LOCKED');
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
});
