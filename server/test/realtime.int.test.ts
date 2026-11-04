/**
 * Tasks K7 and D2: the Socket.IO gateway and live location, over a REAL socket on a real port with the real login cookie.
 * Rooms are joined only after a server-side check (NFR-5.5); positions are throttled, stored, fanned out and stop on time (NFR-5.4).
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULTS } from '@campus-hop/shared';
import { haversineM } from '../src/core/geo';
import { prisma } from '../src/core/prisma';
import { attachRealtime, type Gateway } from '../src/realtime/gateway';
import { LocationService } from '../src/realtime/LocationService';
import { makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

const open: { sockets: Socket[]; server?: HttpServer; gateway?: Gateway }[] = [];

afterEach(async () => {
  for (const o of open.splice(0)) {
    o.sockets.forEach((s) => s.close());
    await o.gateway?.close();
    if (o.server?.listening) await new Promise((r) => o.server!.close(r));
  }
});

async function world(o: { journeyStatus?: 'IN_PROGRESS' | 'OPEN' | 'COMPLETED' } = {}) {
  const t = makeTestApp();
  const cat = await makeCatalog();
  const driver = await makeDriver();
  const journey = await makeJourney(driver.id, { status: o.journeyStatus ?? 'IN_PROGRESS', departureTime: t.clock.now() });
  const rider = await makePassenger({ balanceCents: 500 });
  const booking = await makeBooking(journey.id, rider.id, cat.pickup.hallBBus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED' });
  const server = createServer(t.app);
  await new Promise<void>((r) => server.listen(0, r));
  const gateway = attachRealtime(server, t.ctx);
  const bucket = { sockets: [] as Socket[], server, gateway };
  open.push(bucket);
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;
  const socketFor = async (who?: { id: string; isDriver: boolean; isPassenger: boolean }) => {
    const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: who ? { cookie: t.cookieFor(who) } : {} });
    bucket.sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', (e) => reject(e));
    });
    return s;
  };
  const join = (s: Socket, journeyId = journey.id) => s.emitWithAck('journey:join', { journeyId }) as Promise<{ ok: boolean; code?: string }>;
  return { t, cat, driver, journey, rider, booking, socketFor, join, gateway };
}

const next = <T = unknown>(s: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
    s.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
const silence = async (s: Socket, event: string, ms = 300) => {
  let heard = false;
  s.once(event, () => (heard = true));
  await new Promise((r) => setTimeout(r, ms));
  return !heard;
};

const pos = (lat: number, lng: number, o: { accuracyM?: number; ts?: string } = {}) => ({
  lat,
  lng,
  accuracyM: o.accuracyM ?? 8,
  ts: o.ts ?? '2026-10-19T08:00:00.000Z',
});
/** A point `metres` north of the pickup point (its distance is checked against haversine below). */
const north = (p: { latitude: number; longitude: number }, metres: number) => pos(p.latitude + metres / 111_195, p.longitude);

describe('K7: connecting', () => {
  it('a socket with no cookie is refused (AUTH_REQUIRED); a forged cookie too', async () => {
    const w = await world();
    await expect(w.socketFor()).rejects.toThrow('AUTH_REQUIRED');
    const forged = connect(`http://localhost:${(w.gateway.io.httpServer.address() as AddressInfo).port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { cookie: 'campus_hop_session=not.a.jwt' },
    });
    open[open.length - 1]!.sockets.push(forged);
    await expect(new Promise((_r, rej) => forged.once('connect_error', (e) => rej(e)))).rejects.toThrow('INVALID_TOKEN');
  });

  it('a signed-in socket receives notification:new in its own user room, and only its own', async () => {
    const w = await world();
    const mine = await w.socketFor(w.rider);
    const other = await w.socketFor(w.driver);
    const got = next<{ type: string }>(mine, 'notification:new');
    await w.t.ctx.bus.emit('AccountLocked', { userId: w.rider.id });
    expect((await got).type).toBe('ACCOUNT_LOCKED');
    expect(await silence(other, 'notification:new')).toBe(true);
  });
});

describe('D2: who may join a journey room (NFR-5.5)', () => {
  it("the driver and a CONFIRMED passenger join and both receive the driver's position", async () => {
    const w = await world();
    const driver = await w.socketFor(w.driver);
    const rider = await w.socketFor(w.rider);
    expect((await w.join(driver)).ok).toBe(true);
    expect((await w.join(rider)).ok).toBe(true);

    const heard = next<{ journeyId: string; position: { lat: number } }>(rider, 'location:update');
    const ack = (await driver.emitWithAck('location:update', { journeyId: w.journey.id, position: pos(1.001, 103.0) })) as { ok: boolean };
    expect(ack.ok).toBe(true);
    const msg = await heard;
    expect(msg.journeyId).toBe(w.journey.id);
    expect(msg.position.lat).toBe(1.001);
    expect(await prisma().locationUpdate.count({ where: { journeyId: w.journey.id } })).toBe(1);
  });

  it('a PENDING passenger, a passenger of another journey and a stranger are refused with FORBIDDEN and hear nothing', async () => {
    const w = await world();
    const pending = await makePassenger({ balanceCents: 500 });
    await makeBooking(w.journey.id, pending.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id);
    const elsewhere = await makePassenger({ balanceCents: 500 });
    const other = await makeJourney((await makeDriver()).id, { status: 'IN_PROGRESS' });
    await makeBooking(other.id, elsewhere.id, w.cat.pickup.hallABus.id, w.cat.pickup.gateBus.id, { status: 'CONFIRMED' });
    const driver = await w.socketFor(w.driver);
    await w.join(driver);

    for (const who of [pending, elsewhere, await makePassenger()]) {
      const s = await w.socketFor(who);
      const error = next<{ code: string }>(s, 'app:error');
      const ack = await w.join(s);
      expect(ack).toMatchObject({ ok: false, code: 'FORBIDDEN' });
      expect((await error).code).toBe('FORBIDDEN');
      expect(await silence(s, 'location:update', 150)).toBe(true);
    }
    await driver.emitWithAck('location:update', { journeyId: w.journey.id, position: pos(1.001, 103.0) });
  });

  it('a journey that has not started -> TRIP_NOT_ACTIVE (SRS Q10: no live location before pickup); an unknown journey -> FORBIDDEN', async () => {
    const w = await world({ journeyStatus: 'OPEN' });
    const rider = await w.socketFor(w.rider);
    expect(await w.join(rider)).toMatchObject({ ok: false, code: 'TRIP_NOT_ACTIVE' });
    expect(await w.join(rider, 'nope')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('a passenger cannot send a location update; a malformed payload is VALIDATION_ERROR', async () => {
    const w = await world();
    const rider = await w.socketFor(w.rider);
    expect(await rider.emitWithAck('location:update', { journeyId: w.journey.id, position: pos(1, 103) })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const driver = await w.socketFor(w.driver);
    expect(await driver.emitWithAck('location:update', { journeyId: w.journey.id, position: { lat: 200 } })).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    expect(await prisma().locationUpdate.count()).toBe(0);
  });
});

describe('D2: approaching and arrived (FR 7.5 to 7.8)', () => {
  it('301 m stays WAITING, 300 m becomes APPROACHING, 30 m becomes ARRIVED; the room hears pickup:status with distance and ETA', async () => {
    const w = await world();
    const loc = new LocationService(w.t.ctx);
    const point = await prisma().pickupPoint.findUniqueOrThrow({ where: { id: w.cat.pickup.hallBBus.id } });
    const distance = (p: { lat: number; lng: number }) => haversineM(p, { lat: point.latitude, lng: point.longitude });
    const at301 = north(point, 301);
    const at300 = north(point, 300);
    expect(Math.round(distance(at301))).toBe(301);
    expect(Math.round(distance(at300))).toBe(300);

    const driver = await w.socketFor(w.driver);
    const rider = await w.socketFor(w.rider);
    await w.join(rider);
    const status = (id = w.booking.id) =>
      prisma()
        .booking.findUniqueOrThrow({ where: { id } })
        .then((b) => b.pickupStatus);

    expect((await loc.handleUpdate(w.driver.id, w.journey.id, at301)).changed).toEqual([]);
    expect(await status()).toBe('WAITING');

    w.t.clock.advance(2000);
    const heard = next<{ bookingId: string; status: string; distanceM: number; etaSec: number }>(rider, 'pickup:status');
    const result = await loc.handleUpdate(w.driver.id, w.journey.id, at300);
    expect(result.changed[0]).toMatchObject({ bookingId: w.booking.id, status: 'APPROACHING', distanceM: 300 });
    expect(await status()).toBe('APPROACHING');
    expect(await heard).toMatchObject({ bookingId: w.booking.id, status: 'APPROACHING', distanceM: 300, etaSec: 54 });

    w.t.clock.advance(2000);
    await loc.handleUpdate(w.driver.id, w.journey.id, north(point, 30));
    expect(await status()).toBe('ARRIVED');
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: w.booking.id } })).arrivedAt).not.toBeNull();
    void driver;
  });

  it('a very inaccurate fix (60 m) changes no status', async () => {
    const w = await world();
    const point = await prisma().pickupPoint.findUniqueOrThrow({ where: { id: w.cat.pickup.hallBBus.id } });
    const res = await new LocationService(w.t.ctx).handleUpdate(w.driver.id, w.journey.id, { ...north(point, 10), accuracyM: DEFAULTS.LOW_ACCURACY_M + 10 });
    expect(res).toMatchObject({ accepted: true, changed: [] });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: w.booking.id } })).pickupStatus).toBe('WAITING');
  });

  it('a rider who is dropped off is taken out of the room and stops hearing the driver (FR 7.10)', async () => {
    const w = await world();
    const driver = await w.socketFor(w.driver);
    const rider = await w.socketFor(w.rider);
    await w.join(rider);
    await prisma().booking.update({ where: { id: w.booking.id }, data: { pickupStatus: 'PICKED_UP' } });
    const { TripService } = await import('../src/services/TripService');
    await new TripService(w.t.ctx).updatePickupStatus(w.driver.id, w.booking.id, 'DROPPED_OFF');
    await new Promise((r) => setTimeout(r, 150));
    w.t.clock.advance(2000);
    await driver.emitWithAck('location:update', { journeyId: w.journey.id, position: pos(1.001, 103.0) });
    expect(await silence(rider, 'location:update', 300)).toBe(true);
  });
});

describe('D2: throttle and stop times (NFR-1.4, NFR-5.4, FR 7.12)', () => {
  it('an update less than a second after the last is ignored; after a second it is accepted', async () => {
    const w = await world();
    const loc = new LocationService(w.t.ctx);
    expect((await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.001, 103.0))).accepted).toBe(true);
    w.t.clock.advance(999);
    expect((await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.002, 103.0))).accepted).toBe(false);
    w.t.clock.advance(1);
    expect((await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.002, 103.0))).accepted).toBe(true);
    expect(await prisma().locationUpdate.count({ where: { journeyId: w.journey.id } })).toBe(2);
  });

  it('after completion the last fix is still taken for 30 seconds; a later one is dropped and nothing is stored', async () => {
    const w = await world();
    const loc = new LocationService(w.t.ctx);
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'COMPLETED', completedAt: w.t.clock.now() } });
    w.t.clock.advance(30_000);
    expect((await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.001, 103.0))).accepted).toBe(true);
    w.t.clock.advance(1001);
    expect((await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.002, 103.0))).accepted).toBe(false);
    expect(await prisma().locationUpdate.count({ where: { journeyId: w.journey.id } })).toBe(1);
  });

  it('a trip that has not started does not collect positions at all (NFR-5.3)', async () => {
    const w = await world({ journeyStatus: 'OPEN' });
    await expect(new LocationService(w.t.ctx).handleUpdate(w.driver.id, w.journey.id, pos(1.001, 103.0))).rejects.toMatchObject({ code: 'TRIP_NOT_ACTIVE' });
    expect(await prisma().locationUpdate.count()).toBe(0);
  });

  it('purge: positions of a journey completed more than 30 s ago are deleted and the room is closed; a fresher one is kept; it is idempotent', async () => {
    const w = await world();
    const closed: string[] = [];
    w.t.ctx.realtime = { emitToUser: () => undefined, emitToJourney: () => undefined, closeJourney: (id) => void closed.push(id) };
    const loc = new LocationService(w.t.ctx);
    await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.001, 103.0));
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'COMPLETED', completedAt: w.t.clock.now() } });

    w.t.clock.advance(29_000);
    expect(await loc.purgeFinished()).toEqual([]);
    w.t.clock.advance(1000);
    expect(await loc.purgeFinished()).toEqual([w.journey.id]);
    expect(await prisma().locationUpdate.count()).toBe(0);
    expect(closed).toEqual([w.journey.id]);
    expect(await loc.purgeFinished()).toEqual([]);
  });

  it('cancelling a journey stops sharing at once: the room is closed and the positions are removed by the next purge', async () => {
    const w = await world();
    const rider = await w.socketFor(w.rider);
    await w.join(rider);
    const loc = new LocationService(w.t.ctx);
    await loc.handleUpdate(w.driver.id, w.journey.id, pos(1.001, 103.0));
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'CANCELLED', cancelReason: 'DRIVER' } });
    await w.t.ctx.bus.emit('JourneyCancelled', { journeyId: w.journey.id, driverId: w.driver.id, reason: 'DRIVER', passengerIds: [w.rider.id] });
    await new Promise((r) => setTimeout(r, 100));
    expect(w.gateway.io.sockets.adapter.rooms.get(`journey:${w.journey.id}`)?.size ?? 0).toBe(0);
    expect(await loc.purgeFinished()).toEqual([w.journey.id]);
    expect(await prisma().locationUpdate.count()).toBe(0);
  });
});
