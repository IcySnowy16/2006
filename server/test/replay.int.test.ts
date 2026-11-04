/**
 * Task K7 / Q5: the replay-GPS tool drives a real server over a real socket, signed in as the driver, and the server cannot tell it
 * from a phone: positions are stored, the rider in the room hears them, and the approach to the pickup point changes the status.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { haversineM } from '../src/core/geo';
import { prisma } from '../src/core/prisma';
import { attachRealtime, type Gateway } from '../src/realtime/gateway';
import { densify, runReplay } from '../src/tools/replay';
import { TEST_PASSWORD, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

const open: { server?: HttpServer; gateway?: Gateway; sockets: Socket[] }[] = [];
afterEach(async () => {
  for (const o of open.splice(0)) {
    o.sockets.forEach((s) => s.close());
    await o.gateway?.close();
  }
});

describe('K7: densify', () => {
  it('no two points are further apart than the step, the ends are kept, and a single point stays as it is', () => {
    const path = densify(
      [
        { lat: 1.0, lng: 103.0 },
        { lat: 1.006, lng: 103.0 },
      ],
      100,
    );
    expect(path[0]).toEqual({ lat: 1.0, lng: 103.0 });
    expect(path.at(-1)).toEqual({ lat: 1.006, lng: 103.0 });
    for (let i = 1; i < path.length; i++) expect(haversineM(path[i - 1]!, path[i]!)).toBeLessThanOrEqual(100.5);
    expect(path.length).toBeGreaterThanOrEqual(7); // 667 m at 100 m steps
    expect(densify([{ lat: 1, lng: 103 }], 50)).toEqual([{ lat: 1, lng: 103 }]);
  });
});

describe('K7: runReplay against a real server', () => {
  async function start() {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const driver = await makeDriver();
    const journey = await makeJourney(driver.id, { status: 'IN_PROGRESS', departureTime: t.clock.now() });
    const rider = await makePassenger({ balanceCents: 500 });
    const booking = await makeBooking(journey.id, rider.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED' });
    const server = createServer(t.app);
    await new Promise<void>((r) => server.listen(0, r));
    const gateway = attachRealtime(server, t.ctx);
    const bucket = { server, gateway, sockets: [] as Socket[] };
    open.push(bucket);
    const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
    return { t, cat, driver, journey, rider, booking, baseUrl, bucket };
  }

  it('signs in as the driver, follows the stored route, and the rider in the room hears every position', async () => {
    const w = await start();
    const driverRow = await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } });
    const riderSocket = connect(w.baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { cookie: w.t.cookieFor(w.rider) },
    });
    w.bucket.sockets.push(riderSocket);
    await new Promise<void>((r) => riderSocket.once('connect', () => r()));
    expect(((await riderSocket.emitWithAck('journey:join', { journeyId: w.journey.id })) as { ok: boolean }).ok).toBe(true);
    const heard: number[] = [];
    riderSocket.on('location:update', (m: { position: { lat: number } }) => heard.push(m.position.lat));

    const lines: string[] = [];
    const result = await runReplay({
      baseUrl: w.baseUrl,
      email: driverRow.ntuEmail,
      password: TEST_PASSWORD,
      stepM: 250,
      intervalMs: 1,
      sleep: async () => void w.t.clock.advance(1100), // the server's one-per-second throttle runs on the test clock
      log: (l) => lines.push(l),
    });

    expect(result.journeyId).toBe(w.journey.id);
    expect(result.sent).toBeGreaterThanOrEqual(4);
    expect(result.accepted).toBe(result.sent);
    expect(await prisma().locationUpdate.count({ where: { journeyId: w.journey.id } })).toBe(result.sent);
    await new Promise((r) => setTimeout(r, 200));
    expect(heard).toHaveLength(result.sent);
    expect(heard).toEqual([...heard].sort((a, b) => a - b)); // moving north, in order
    expect(lines[0]).toContain('signed in as');
  });

  it("reaching the rider's pickup point marks the rider ARRIVED, just as a real phone would", async () => {
    const w = await start();
    const driverRow = await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } });
    const stop = await prisma().pickupPoint.findUniqueOrThrow({ where: { id: w.cat.pickup.hallABus.id } });
    await runReplay({
      baseUrl: w.baseUrl,
      email: driverRow.ntuEmail,
      password: TEST_PASSWORD,
      path: [
        { lat: stop.latitude - 0.004, lng: stop.longitude },
        { lat: stop.latitude, lng: stop.longitude },
      ],
      stepM: 60,
      intervalMs: 1,
      sleep: async () => void w.t.clock.advance(1100),
    });
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: w.booking.id } })).pickupStatus).toBe('ARRIVED');
  });

  it('says plainly what is wrong: bad password, no trip in progress', async () => {
    const w = await start();
    const driverRow = await prisma().user.findUniqueOrThrow({ where: { id: w.driver.id } });
    await expect(runReplay({ baseUrl: w.baseUrl, email: driverRow.ntuEmail, password: 'wrong-password' })).rejects.toThrow('Login failed (401)');
    await prisma().journey.update({ where: { id: w.journey.id }, data: { status: 'OPEN' } });
    await expect(runReplay({ baseUrl: w.baseUrl, email: driverRow.ntuEmail, password: TEST_PASSWORD })).rejects.toThrow('No journey is IN_PROGRESS');
  });
});
