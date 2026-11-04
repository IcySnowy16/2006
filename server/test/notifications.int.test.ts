/**
 * Task D3: notifications. One test per event type checks the recipient and the text; the inbox routes (list, read, read-all,
 * preferences) and the push retry with back-off are tested too. FR 8.1 to 8.13, NFR-1.3.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DomainEvents, EventName } from '../src/events/events';
import { prisma } from '../src/core/prisma';
import { expectError, makeDriver, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

async function world() {
  const t = makeTestApp();
  const driver = await makeDriver({ name: 'Dara Driver' });
  const p1 = await makePassenger({ name: 'Pei Passenger' });
  const p2 = await makePassenger({ name: 'Priya Other' });
  const inbox = (userId: string) => prisma().notification.findMany({ where: { userId }, orderBy: { timestamp: 'asc' } });
  return { t, driver, p1, p2, inbox };
}

type Case = {
  also?: ('driver' | 'p1' | 'p2')[];
  event: EventName;
  payload: (w: Awaited<ReturnType<typeof world>>) => DomainEvents[EventName];
  to: 'driver' | 'p1' | 'p2';
  type: string;
  text: RegExp;
};

const cases: Case[] = [
  {
    event: 'BookingRequested',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', driverId: w.driver.id, passengerId: w.p1.id }),
    to: 'driver',
    type: 'BOOKING_REQUEST',
    text: /Pei asked to join your trip/,
  },
  {
    event: 'BookingConfirmed',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', driverId: w.driver.id, passengerId: w.p1.id }),
    to: 'p1',
    type: 'BOOKING_CONFIRMED',
    text: /seat is confirmed/,
  },
  {
    event: 'BookingDeclined',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', driverId: w.driver.id, passengerId: w.p1.id, automatic: false }),
    to: 'p1',
    type: 'BOOKING_DECLINED',
    text: /driver declined/,
  },
  {
    event: 'BookingDeclined',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', driverId: w.driver.id, passengerId: w.p1.id, automatic: true }),
    to: 'p1',
    type: 'BOOKING_DECLINED',
    text: /could not be confirmed/,
  },
  {
    event: 'BookingCancelled',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', driverId: w.driver.id, passengerId: w.p1.id, by: 'PASSENGER' }),
    to: 'driver',
    type: 'BOOKING_DECLINED',
    text: /passenger cancelled/,
  },
  {
    event: 'JourneyCancelled',
    payload: (w) => ({ journeyId: 'j1', driverId: w.driver.id, reason: 'DRIVER', passengerIds: [w.p1.id] }),
    to: 'p1',
    type: 'JOURNEY_CANCELLED',
    text: /driver cancelled this trip/,
  },
  {
    also: ['p1'],
    event: 'JourneyCancelled',
    payload: (w) => ({ journeyId: 'j1', driverId: w.driver.id, reason: 'GEOFENCE', passengerIds: [w.p1.id] }),
    to: 'driver',
    type: 'GEOFENCE_CANCELLED',
    text: /left the campus/,
  },
  {
    event: 'JourneyExpired',
    payload: (w) => ({ journeyId: 'j1', driverId: w.driver.id }),
    to: 'driver',
    type: 'JOURNEY_EXPIRED',
    text: /nobody booked in time/,
  },
  {
    event: 'FareChanged',
    payload: (w) => ({ bookingId: 'b1', passengerId: w.p1.id, oldCents: 300, newCents: 200 }),
    to: 'p1',
    type: 'FARE_CHANGED',
    text: /from \$3\.00 to \$2\.00/,
  },
  {
    event: 'TripStarted',
    payload: (w) => ({ journeyId: 'j1', driverId: w.driver.id, passengerIds: [w.p1.id] }),
    to: 'p1',
    type: 'TRIP_STARTED',
    text: /trip has started/,
  },
  {
    event: 'PickupStatusChanged',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', passengerId: w.p1.id, driverId: w.driver.id, status: 'APPROACHING', distanceM: 250, etaSec: 40 }),
    to: 'p1',
    type: 'DRIVER_APPROACHING',
    text: /almost at your pickup/,
  },
  {
    event: 'PickupStatusChanged',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', passengerId: w.p1.id, driverId: w.driver.id, status: 'ARRIVED', distanceM: 20, etaSec: 5 }),
    to: 'p1',
    type: 'DRIVER_ARRIVED',
    text: /has arrived/,
  },
  {
    event: 'PickupStatusChanged',
    payload: (w) => ({ bookingId: 'b1', journeyId: 'j1', passengerId: w.p1.id, driverId: w.driver.id, status: 'NO_SHOW', distanceM: null, etaSec: null }),
    to: 'p1',
    type: 'NO_SHOW',
    text: /no-show/,
  },
  {
    event: 'TripCompleted',
    payload: (w) => ({ journeyId: 'j1', driverId: w.driver.id, passengerIds: [w.p1.id] }),
    to: 'p1',
    type: 'TRIP_COMPLETED',
    text: /rate your driver/,
  },
  {
    event: 'WalletChecked',
    payload: (w) => ({ bookingId: 'b1', passengerId: w.p1.id, check: 'ENOUGH' }),
    to: 'p1',
    type: 'WALLET_CHECK',
    text: /enough balance/,
  },
  { event: 'WalletChecked', payload: (w) => ({ bookingId: 'b1', passengerId: w.p1.id, check: 'ON_TRUST' }), to: 'p1', type: 'WALLET_CHECK', text: /on trust/ },
  {
    event: 'WalletChecked',
    payload: (w) => ({ bookingId: 'b1', passengerId: w.p1.id, check: 'NOT_ENOUGH' }),
    to: 'p1',
    type: 'WALLET_CHECK',
    text: /not enough balance/,
  },
  { event: 'DebtRecorded', payload: (w) => ({ userId: w.p1.id, bookingId: 'b1', amountCents: 70 }), to: 'p1', type: 'DEBT_RECORDED', text: /owe \$0\.70/ },
  { event: 'AccountLocked', payload: (w) => ({ userId: w.p1.id }), to: 'p1', type: 'ACCOUNT_LOCKED', text: /locked until you top up/ },
  { event: 'AccountUnlocked', payload: (w) => ({ userId: w.p1.id }), to: 'p1', type: 'ACCOUNT_UNLOCKED', text: /unlocked/ },
  {
    event: 'RequestAccepted',
    payload: (w) => ({ hopRequestId: 'h1', passengerId: w.p1.id, journeyId: 'j1' }),
    to: 'p1',
    type: 'REQUEST_ACCEPTED',
    text: /driver going your way/,
  },
];

describe('D3: each event notifies the right person with the right text', () => {
  it.each(cases.map((c, i) => [`${c.event} -> ${c.to} (${c.type}) #${i}`, c] as const))('%s', async (_name, c) => {
    const w = await world();
    await w.t.ctx.bus.emit(c.event, c.payload(w) as never);
    const target = { driver: w.driver, p1: w.p1, p2: w.p2 }[c.to];
    const mine = await w.inbox(target.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: c.type, isRead: false });
    expect(mine[0]!.message).toMatch(c.text);
    // nobody else got anything (a geofence cancel also tells the passengers, FR 8.3 and 8.9)
    const allowed = new Set([c.to, ...(c.also ?? [])].map((k) => ({ driver: w.driver, p1: w.p1, p2: w.p2 })[k].id));
    for (const other of [w.driver, w.p1, w.p2].filter((u) => !allowed.has(u.id))) expect(await w.inbox(other.id)).toHaveLength(0);
  });

  it('a journey cancelled by the driver tells EVERY confirmed passenger, once each', async () => {
    const w = await world();
    await w.t.ctx.bus.emit('JourneyCancelled', { journeyId: 'j1', driverId: w.driver.id, reason: 'DRIVER', passengerIds: [w.p1.id, w.p2.id] });
    expect(await w.inbox(w.p1.id)).toHaveLength(1);
    expect(await w.inbox(w.p2.id)).toHaveLength(1);
    expect(await w.inbox(w.driver.id)).toHaveLength(0); // the driver pressed the button; only geofence and expiry tell the driver (FR 8.9)
  });
});

describe('D3: the inbox routes (FR 8.12)', () => {
  it('lists newest first with the unread count; the empty list is a normal answer', async () => {
    const w = await world();
    const empty = await request(w.t.app).get('/api/notifications').set('Cookie', w.t.cookieFor(w.p1));
    expect(empty.body).toEqual({ items: [], unreadCount: 0 });

    await w.t.ctx.bus.emit('AccountLocked', { userId: w.p1.id });
    w.t.clock.advance(60_000);
    await w.t.ctx.bus.emit('AccountUnlocked', { userId: w.p1.id });
    const res = await request(w.t.app).get('/api/notifications').set('Cookie', w.t.cookieFor(w.p1));
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.items.map((n: { type: string }) => n.type)).toEqual(['ACCOUNT_UNLOCKED', 'ACCOUNT_LOCKED']);
  });

  it("mark one read; another user's notification is FORBIDDEN; unknown is NOT_FOUND", async () => {
    const w = await world();
    await w.t.ctx.bus.emit('AccountLocked', { userId: w.p1.id });
    const [n] = await w.inbox(w.p1.id);
    expectError(await request(w.t.app).post(`/api/notifications/${n!.id}/read`).set('Cookie', w.t.cookieFor(w.p2)), 'FORBIDDEN');
    expectError(await request(w.t.app).post('/api/notifications/nope/read').set('Cookie', w.t.cookieFor(w.p1)), 'NOT_FOUND');
    expect((await request(w.t.app).post(`/api/notifications/${n!.id}/read`).set('Cookie', w.t.cookieFor(w.p1))).status).toBe(204);
    expect((await w.inbox(w.p1.id))[0]!.isRead).toBe(true);
  });

  it("read-all marks every notification of the caller read and nobody else's", async () => {
    const w = await world();
    for (const u of [w.p1, w.p1, w.p2]) await w.t.ctx.bus.emit('AccountLocked', { userId: u.id });
    expect((await request(w.t.app).post('/api/notifications/read-all').set('Cookie', w.t.cookieFor(w.p1))).status).toBe(204);
    expect((await w.inbox(w.p1.id)).every((n) => n.isRead)).toBe(true);
    expect((await w.inbox(w.p2.id)).every((n) => !n.isRead)).toBe(true);
  });

  it('the push preference defaults to on, round-trips, and an invalid body is VALIDATION_ERROR', async () => {
    const w = await world();
    const cookie = w.t.cookieFor(w.p1);
    expect((await request(w.t.app).get('/api/notifications/preferences').set('Cookie', cookie)).body).toEqual({ push: true });
    expect((await request(w.t.app).put('/api/notifications/preferences').set('Cookie', cookie).send({ push: false })).status).toBe(204);
    expect((await request(w.t.app).get('/api/notifications/preferences').set('Cookie', cookie)).body).toEqual({ push: false });
    expectError(await request(w.t.app).put('/api/notifications/preferences').set('Cookie', cookie).send({ push: 'maybe' }), 'VALIDATION_ERROR');
    expectError(await request(w.t.app).get('/api/notifications'), 'AUTH_REQUIRED');
  });
});

describe('D3: push delivery (FR 8.13) and retry with back-off (NFR-1.3)', () => {
  const push = async (w: Awaited<ReturnType<typeof world>>) => w.t.ctx.bus.emit('AccountLocked', { userId: w.p1.id });

  it('with the flag off nothing is pushed, but the notification is stored', async () => {
    const w = await world();
    await push(w);
    expect(w.t.adapters.push.sent).toHaveLength(0);
    expect(await w.inbox(w.p1.id)).toHaveLength(1);
  });

  it('with the flag on and the user opted in, it is pushed; opted out, it is not', async () => {
    const w = await world();
    w.t.ctx.flags.pushNotifications = true;
    await push(w);
    expect(w.t.adapters.push.sent).toHaveLength(1);
    expect(w.t.adapters.push.sent[0]!.userId).toBe(w.p1.id);
    await prisma().user.update({ where: { id: w.p1.id }, data: { pushEnabled: false } });
    await push(w);
    expect(w.t.adapters.push.sent).toHaveLength(1);
    expect(await w.inbox(w.p1.id)).toHaveLength(2);
  });

  it('a failing push keeps the stored notification and is retried after 1 s, then 5 s, until it works', async () => {
    const w = await world();
    w.t.ctx.flags.pushNotifications = true;
    w.t.adapters.push.failNext(2);
    await push(w);
    const service = w.t.ctx.notifications!;
    expect(await w.inbox(w.p1.id)).toHaveLength(1);
    expect(service.pendingPushes).toBe(1);

    expect(await service.retryDue()).toBe(0); // too early: nothing due
    w.t.clock.advance(1000);
    expect(await service.retryDue()).toBe(0); // due, fails the second time
    expect(service.pendingPushes).toBe(1);
    w.t.clock.advance(4999);
    expect(await service.retryDue()).toBe(0); // 5 s back-off not over yet
    w.t.clock.advance(1);
    expect(await service.retryDue()).toBe(1); // delivered
    expect(w.t.adapters.push.sent).toHaveLength(1);
    expect(service.pendingPushes).toBe(0);
  });

  it('gives up after three retries; the notification stays in the inbox', async () => {
    const w = await world();
    w.t.ctx.flags.pushNotifications = true;
    w.t.adapters.push.failNext(10);
    await push(w);
    const service = w.t.ctx.notifications!;
    for (const wait of [1000, 5000, 30_000]) {
      w.t.clock.advance(wait);
      await service.retryDue();
    }
    expect(service.pendingPushes).toBe(0);
    expect(w.t.adapters.push.sent).toHaveLength(0);
    expect(await w.inbox(w.p1.id)).toHaveLength(1);
  });

  it('a notification failure never undoes the thing that caused it: a failing database write in a handler is swallowed by the bus', async () => {
    const w = await world();
    await expect(w.t.ctx.bus.emit('AccountLocked', { userId: 'no-such-user' })).resolves.toBeUndefined();
  });

  it('a live socket gets notification:new', async () => {
    const w = await world();
    const sent: { userId: string; event: string; payload: unknown }[] = [];
    w.t.ctx.realtime = { emitToUser: (userId, event, payload) => void sent.push({ userId, event, payload }), emitToJourney: () => undefined };
    await push(w);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ userId: w.p1.id, event: 'notification:new', payload: { type: 'ACCOUNT_LOCKED', isRead: false } });
  });
});
