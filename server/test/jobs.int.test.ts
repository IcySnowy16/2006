/**
 * Task D4: the timers. Each sweep is tested at just before and just after its boundary with a FakeClock, is run twice to show it is
 * idempotent, and a failing sweep must not stop the others. UC-4.EX.3, UC-10.EX.1, FR 3.5, 5.5, 6.7, 7.12.
 */
import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../src/jobs/runner';
import { startJobs, Sweeps } from '../src/jobs';
import { minutes, sgDate } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

describe('D4: expire journeys (FR 3.5, UC-4.EX.3)', () => {
  it('just before the 15-minute window nothing; just after, EXPIRED; running again changes nothing', async () => {
    const t = makeTestApp();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { departureTime: t.clock.now() });
    const jobs = new Sweeps(t.ctx);
    t.clock.advance(minutes(15) - 1000);
    expect(await jobs.expireJourneys()).toEqual([]);
    t.clock.advance(2000);
    expect(await jobs.expireJourneys()).toEqual([j.id]);
    expect(await jobs.expireJourneys()).toEqual([]);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('EXPIRED');
  });
});

describe('D4: decline unanswered requests and expire hop requests (FR 5.5, UC-10.EX.1)', () => {
  it('declines a pending request once its trip is under way, expires an old hop request, and a second run does nothing', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const running = await makeJourney(d.id, { status: 'IN_PROGRESS' });
    const p = await makePassenger({ balanceCents: 500 });
    const stale = await makeBooking(running.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id);
    const q = await makePassenger({ balanceCents: 500 });
    const request = await prisma().hopRequest.create({
      data: {
        passengerId: q.id,
        fromLocationId: cat.hallB.id,
        toLocationId: cat.mainGate.id,
        requestedTime: t.clock.now(),
        expiresAt: new Date(t.clock.now().getTime() + minutes(15)),
      },
    });
    const jobs = new Sweeps(t.ctx);

    expect(await jobs.declineAndExpire()).toEqual({ declined: 1, expiredRequests: 0 });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('CANCELLED');
    t.clock.advance(minutes(15) + 1000);
    expect(await jobs.declineAndExpire()).toEqual({ declined: 0, expiredRequests: 1 });
    expect((await prisma().hopRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('EXPIRED');
    expect(await jobs.declineAndExpire()).toEqual({ declined: 0, expiredRequests: 0 });
  });
});

describe('D4: the No-show window opens 3 minutes after ARRIVED (FR 6.7)', () => {
  it('2:59 nothing; 3:00 the event fires once; running again does not repeat it', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'IN_PROGRESS' });
    const p = await makePassenger({ balanceCents: 500 });
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', pickupStatus: 'ARRIVED' });
    await prisma().booking.update({ where: { id: b.id }, data: { arrivedAt: t.clock.now() } });
    const heard: string[] = [];
    t.ctx.bus.on('NoShowWindowOpened', (e) => void heard.push(e.bookingId));
    const jobs = new Sweeps(t.ctx);

    t.clock.advance(minutes(3) - 1000);
    expect(await jobs.openNoShowWindows()).toEqual([]);
    t.clock.advance(1000);
    expect(await jobs.openNoShowWindows()).toEqual([b.id]);
    expect(await jobs.openNoShowWindows()).toEqual([]);
    expect(heard).toEqual([b.id]);
  });
});

describe('D4: stop sharing (FR 7.12)', () => {
  it('positions of a journey completed 30 s ago are deleted; 29 s is too early', async () => {
    const t = makeTestApp();
    const d = await makeDriver();
    const j = await makeJourney(d.id, { status: 'COMPLETED' });
    await prisma().journey.update({ where: { id: j.id }, data: { completedAt: t.clock.now() } });
    await prisma().locationUpdate.create({ data: { journeyId: j.id, latitude: 1, longitude: 103, accuracyM: 5, timestamp: t.clock.now() } });
    const jobs = new Sweeps(t.ctx);
    t.clock.advance(29_000);
    expect(await jobs.purgeSharing()).toEqual([]);
    t.clock.advance(1000);
    expect(await jobs.purgeSharing()).toEqual([j.id]);
    expect(await jobs.purgeSharing()).toEqual([]);
    expect(await prisma().locationUpdate.count()).toBe(0);
  });
});

describe('D4: the daily trip counter resets at midnight Singapore time (FR 6.4)', () => {
  it("a counter from yesterday is reset, today's is kept, and a second run changes nothing", async () => {
    const t = makeTestApp();
    const today = sgDate(t.clock.now());
    const stale = await makeDriver({ dailyPaidTrips: 2, lastPaidTripDate: '2026-10-18' });
    const fresh = await makeDriver({ dailyPaidTrips: 1, lastPaidTripDate: today });
    const jobs = new Sweeps(t.ctx);
    expect(await jobs.resetDailyCounters()).toBe(1);
    expect((await prisma().driverProfile.findUniqueOrThrow({ where: { userId: stale.id } })).dailyPaidTrips).toBe(0);
    expect((await prisma().driverProfile.findUniqueOrThrow({ where: { userId: fresh.id } })).dailyPaidTrips).toBe(1);
    expect(await jobs.resetDailyCounters()).toBe(0);

    // midnight: 16:00 Singapore on the 19th is 08:00Z; 00:00 on the 20th is 16:00Z the same day
    t.clock.set('2026-10-19T15:59:59Z');
    expect(await jobs.resetDailyCounters()).toBe(0);
    t.clock.set('2026-10-19T16:00:00Z');
    expect(await jobs.resetDailyCounters()).toBe(1);
    expect((await prisma().driverProfile.findUniqueOrThrow({ where: { userId: fresh.id } })).dailyPaidTrips).toBe(0);
  });
});

describe('D4: the scheduler', () => {
  it('registers six sweeps with their intervals, and a failing sweep does not stop the others', async () => {
    const t = makeTestApp();
    const handlers: { fn: () => void; ms: number }[] = [];
    const scheduler: Scheduler = { setInterval: (fn, ms) => (handlers.push({ fn, ms }), handlers.length), clearInterval: () => undefined };
    const errors: string[] = [];
    const set = startJobs(t.ctx, { error: (o) => void errors.push(String(o.sweep)) }, scheduler);
    expect(set.sweeps.map((s) => s.name)).toEqual([
      'expire-journeys',
      'decline-and-expire',
      'no-show-window',
      'purge-sharing',
      'reset-daily-counters',
      'retry-pushes',
    ]);
    expect(handlers.map((h) => h.ms)).toEqual([60_000, 60_000, 10_000, 10_000, 60_000, 10_000]);

    // make the first one fail, run all
    t.ctx.db = () => {
      throw new Error('database is down');
    };
    await Promise.all(set.sweeps.map((s) => s.tick()));
    expect(set.sweeps.filter((s) => s.failures > 0).length).toBeGreaterThanOrEqual(1);
    expect(set.sweeps.every((s) => s.runs === 1)).toBe(true); // every sweep ran, whatever the others did
    expect(errors.length).toBeGreaterThanOrEqual(1);
    set.stop();
  });
});
