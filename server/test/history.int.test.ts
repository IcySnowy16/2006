/** Task E1: history (UC-19) and ratings (FR 9.1 to 9.6). Real PostgreSQL. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/core/prisma';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';
import { cleanComment } from '../src/services/HistoryService';

async function world() {
  const t = makeTestApp();
  const cat = await makeCatalog();
  const driver = await makeDriver();
  const journey = await makeJourney(driver.id, { status: 'COMPLETED' });
  const passenger = await makePassenger({ balanceCents: 500 });
  const done = await makeBooking(journey.id, passenger.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
    status: 'COMPLETED',
    pickupStatus: 'DROPPED_OFF',
    paymentStatus: 'PAID',
    currentFareCents: 300,
  });
  await prisma().booking.update({ where: { id: done.id }, data: { finalFareCents: 300 } });
  const rate = (who: { id: string; isDriver: boolean; isPassenger: boolean }, bookingId: string, body: Record<string, unknown>) =>
    request(t.app).post(`/api/bookings/${bookingId}/ratings`).set('Cookie', t.cookieFor(who)).send(body);
  return { t, cat, driver, journey, passenger, done, rate };
}

describe('E1: rating (UC-19)', () => {
  it('a passenger rates the driver and the driver rates the passenger; each is stored once', async () => {
    const w = await world();
    expect((await w.rate(w.passenger, w.done.id, { stars: 5, comment: 'Friendly and on time' })).status).toBe(204);
    expect((await w.rate(w.driver, w.done.id, { stars: 4 })).status).toBe(204);
    const rows = await prisma().rating.findMany({ where: { bookingId: w.done.id } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.raterId === w.passenger.id)).toMatchObject({ rateeId: w.driver.id, stars: 5, comment: 'Friendly and on time' });
    expect(rows.find((r) => r.raterId === w.driver.id)).toMatchObject({ rateeId: w.passenger.id, stars: 4, comment: null });
  });

  it('before the trip is completed -> ILLEGAL_STATE_TRANSITION; a no-show cannot be rated', async () => {
    const w = await world();
    const open = await makeBooking(w.journey.id, (await makePassenger()).id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, { status: 'CONFIRMED' });
    expectError(await w.rate(w.driver, open.id, { stars: 5 }), 'ILLEGAL_STATE_TRANSITION');
    const absent = await makeBooking(w.journey.id, (await makePassenger()).id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, {
      status: 'COMPLETED',
      pickupStatus: 'NO_SHOW',
    });
    expectError(await w.rate(w.driver, absent.id, { stars: 5 }), 'ILLEGAL_STATE_TRANSITION');
  });

  it('a second rating by the same user -> ALREADY_RATED, and the average is not changed by it', async () => {
    const w = await world();
    await w.rate(w.passenger, w.done.id, { stars: 5 }).expect(204);
    expectError(await w.rate(w.passenger, w.done.id, { stars: 1 }), 'ALREADY_RATED');
    expect(await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } })).toMatchObject({ ratingSum: 5, ratingCount: 1 });
  });

  it('two requests at the same moment: one wins, the other is ALREADY_RATED', async () => {
    const w = await world();
    const results = await Promise.all([w.rate(w.passenger, w.done.id, { stars: 5 }), w.rate(w.passenger, w.done.id, { stars: 4 })]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(await prisma().rating.count({ where: { bookingId: w.done.id } })).toBe(1);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } })).ratingCount).toBe(1);
  });

  it('0 and 6 stars, 1.5 stars and a 201-character comment are VALIDATION_ERROR; 200 characters is fine', async () => {
    const w = await world();
    for (const bad of [{ stars: 0 }, { stars: 6 }, { stars: 1.5 }, { stars: 4, comment: 'x'.repeat(201) }])
      expectError(await w.rate(w.passenger, w.done.id, bad), 'VALIDATION_ERROR');
    expect((await w.rate(w.passenger, w.done.id, { stars: 4, comment: 'x'.repeat(200) })).status).toBe(204);
  });

  it("only the booking's own driver and passenger may rate; unknown is NOT_FOUND", async () => {
    const w = await world();
    expectError(await w.rate(await makePassenger(), w.done.id, { stars: 5 }), 'FORBIDDEN');
    expectError(await w.rate(w.passenger, 'nope', { stars: 5 }), 'NOT_FOUND');
  });

  it('the average is kept to one decimal: 5 and 4 -> 4.5; 5, 5 and 4 -> 4.7', async () => {
    const w = await world();
    const rateBy = async (stars: number) => {
      const p = await makePassenger();
      const b = await makeBooking(w.journey.id, p.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, { status: 'COMPLETED', pickupStatus: 'DROPPED_OFF' });
      await w.rate(p, b.id, { stars }).expect(204);
    };
    await rateBy(5);
    await rateBy(4);
    const me = await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } });
    expect(me.ratingSum / me.ratingCount).toBe(4.5);
    await rateBy(5);
    const again = await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } });
    expect(Math.round((again.ratingSum / again.ratingCount) * 10) / 10).toBe(4.7);
  });

  it('comments lose control characters and are stored as plain text (never rendered as HTML)', async () => {
    const w = await world();
    await w.rate(w.passenger, w.done.id, { stars: 5, comment: 'Great\u0000 ride\n\n<script>alert(1)</script>\u0007' }).expect(204);
    const stored = (await prisma().rating.findFirstOrThrow({ where: { bookingId: w.done.id } })).comment!;
    expect(stored).toBe('Great ride <script>alert(1)</script>');
    expect(cleanComment('  a\tb\r\nc ')).toBe('a b c');
  });
});

describe('E1: history (UC-19)', () => {
  it('an empty history is a normal answer', async () => {
    const t = makeTestApp();
    const res = await request(t.app)
      .get('/api/history')
      .set('Cookie', t.cookieFor(await makePassenger()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('a passenger sees their bookings newest first with pickup status, fare, payment outcome and whether they can still rate', async () => {
    const w = await world();
    const older = await makeJourney(w.driver.id, { status: 'COMPLETED', departureTime: new Date('2026-10-12T08:00:00Z') });
    const noShow = await makeBooking(older.id, w.passenger.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, {
      status: 'COMPLETED',
      pickupStatus: 'NO_SHOW',
    });
    const unpaidJourney = await makeJourney(w.driver.id, { status: 'COMPLETED', departureTime: new Date('2026-10-14T08:00:00Z') });
    const unpaid = await makeBooking(unpaidJourney.id, w.passenger.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, {
      status: 'COMPLETED',
      pickupStatus: 'UNPAID',
      paymentStatus: 'UNPAID',
    });

    const res = await request(w.t.app).get('/api/history').set('Cookie', w.t.cookieFor(w.passenger));
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([w.done.id, unpaid.id, noShow.id]);
    expect(res.body[0]).toMatchObject({
      kind: 'BOOKING',
      status: 'COMPLETED',
      pickupStatus: 'DROPPED_OFF',
      fareCents: 300,
      paymentOutcome: 'PAID',
      canRate: true,
    });
    expect(res.body[1]).toMatchObject({ pickupStatus: 'UNPAID', paymentOutcome: 'UNPAID' });
    expect(res.body[2]).toMatchObject({ pickupStatus: 'NO_SHOW', paymentOutcome: 'NO_CHARGE', canRate: false });

    await w.rate(w.passenger, w.done.id, { stars: 5 });
    const after = await request(w.t.app).get('/api/history').set('Cookie', w.t.cookieFor(w.passenger));
    expect(after.body[0].canRate).toBe(false);
  });

  it('a driver sees their journeys with what they earned', async () => {
    const w = await world();
    // "Earned" is what reached the driver's wallet: the CREDIT row a real completion writes (the fixture sets the fare directly).
    await prisma().walletTransaction.create({
      data: { walletUserId: w.driver.id, type: 'CREDIT', amountCents: 300, bookingId: w.done.id, timestamp: w.t.clock.now() },
    });
    const res = await request(w.t.app).get('/api/history').set('Cookie', w.t.cookieFor(w.driver));
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ kind: 'JOURNEY', id: w.journey.id, status: 'COMPLETED', fareCents: 300, paymentOutcome: 'EARNED' });
  });

  it("nobody else's trips appear", async () => {
    const w = await world();
    const res = await request(w.t.app)
      .get('/api/history')
      .set('Cookie', w.t.cookieFor(await makePassenger()));
    expect(res.body).toEqual([]);
  });
});
