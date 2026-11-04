/**
 * Task Q3: the whole product once, through the HTTP API only, the way the web app drives it:
 * register -> verify the e-mailed code -> top up -> go live -> request -> book -> accept -> start -> pick up -> drop off -> complete -> rate.
 * Then the same flow with the REAL SMTP adapter and the Mailpit container, and the contention case (the last seat, wanted twice).
 * Real PostgreSQL, fake Maps and PayNow, a clock the test controls.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createFakeAdapters } from '../src/adapters';
import { SmtpEmailAdapter } from '../src/adapters/email/SmtpEmailAdapter';
import { createApp } from '../src/app';
import { parseEnv } from '../src/config/env';
import { createContext } from '../src/context';
import { FakeClock } from '../src/core/clock';
import { prisma } from '../src/core/prisma';
import { seedFareTiers } from '../src/seed/seedCatalog';
import { makeCatalog } from './helpers';
import { TEST_JWT_SECRET, makeTestApp, type TestApp } from './helpers/app';
import { TEST_DATABASE_URL } from './db/testUrl';
import { expectLedgerReconcilesWithBalances } from './helpers/ledger';

let n = 0;
const unique = () => `${Date.now().toString(36)}${++n}`;

/** Registers and verifies a person through the API, then signs them in. Returns an agent that carries their cookie. */
async function signUp(t: TestApp, name: string, role: 'DRIVER' | 'PASSENGER', codeOf?: (email: string) => Promise<string>) {
  const ntuEmail = `${name.toLowerCase()}.${unique()}@e.ntu.edu.sg`;
  const password = 'correct-horse-battery';
  const reg = await request(t.app)
    .post('/api/auth/register')
    .send({ name: `${name} Test`, ntuEmail, phone: `+65 9${String(1000000 + n).slice(-7)}`, password, role });
  expect(reg.status).toBe(201);
  const code = codeOf ? await codeOf(ntuEmail) : t.adapters.email.lastCodeFor(ntuEmail);
  expect(code).toMatch(/^\d{6}$/);
  expect((await request(t.app).post('/api/auth/verify').send({ ntuEmail, code })).status).toBe(204);
  const agent = request.agent(t.app);
  const login = await agent.post('/api/auth/login').send({ ntuEmail, password });
  expect(login.status).toBe(200);
  return { agent, me: login.body as { id: string; roles: string[]; activeRole: string | null }, ntuEmail };
}

const posAt = (t: TestApp, lat: number, lng: number) => ({ lat, lng, accuracyM: 8, ts: t.clock.now().toISOString() });

describe('Q3: the happy path through the API', () => {
  it('two riders share a trip: fares drop to $2.00, the driver is paid $4.00, everybody rates', async () => {
    const t = makeTestApp();
    await seedFareTiers(prisma());
    const cat = await makeCatalog();

    // --- people
    const driver = await signUp(t, 'Dara', 'DRIVER');
    const ana = await signUp(t, 'Ana', 'PASSENGER');
    const ben = await signUp(t, 'Ben', 'PASSENGER');
    expect(driver.me.activeRole).toBe('DRIVER');
    expect(ana.me.activeRole).toBe('PASSENGER');

    // --- the driver sets up once: vehicle, a preset, then goes live
    await driver.agent.put('/api/driver/profile').send({ vehiclePlate: 'SBA1234A', vehicleModel: 'Toyota Vios', payNowId: '91234567' }).expect(200);
    const preset = (
      await driver.agent
        .post('/api/presets')
        .send({
          name: 'Home run',
          exitGateId: cat.mainGate.id,
          plan: 'SHARING',
          allowedPickupTypes: ['BUS_STOP', 'CARPARK'],
          detourToleranceMin: 5,
          exemptionConfirmed: true,
        })
        .expect(201)
    ).body;
    const journey = (
      await driver.agent
        .post('/api/journeys')
        .send({ presetId: preset.id, position: posAt(t, 1.0, 103.0), locationPermission: true })
        .expect(201)
    ).body;
    expect(journey).toMatchObject({ status: 'LIVE', seatsAvailable: 3 });
    expect(journey.route.polyline).toBeTruthy();

    // --- two riders top up, ask for a hop and book from the ranked match
    const bookings: string[] = [];
    for (const rider of [ana, ben]) {
      const wallet = (await rider.agent.post('/api/wallet/top-up').send({ amountCents: 1000 }).expect(200)).body;
      expect(wallet).toMatchObject({ balanceCents: 1000, simulated: true });

      const asked = (await rider.agent.post('/api/hop-requests').send({ fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id }).expect(201)).body;
      expect(asked.matches).toHaveLength(1);
      const match = asked.matches[0];
      expect(match).toMatchObject({ journeyId: journey.id, pickupPoint: { id: cat.pickup.hallBBus.id } });

      const preview = (await rider.agent.get(`/api/bookings/preview?journeyId=${journey.id}`).expect(200)).body;
      expect(preview.check).toBe('ENOUGH');
      const booking = (
        await rider.agent
          .post('/api/bookings')
          .send({ journeyId: journey.id, hopRequestId: asked.hopRequest.id, pickupPointId: match.pickupPoint.id, dropoffPointId: cat.pickup.gateBus.id })
          .expect(201)
      ).body;
      expect(booking.status).toBe('PENDING');
      bookings.push(booking.id);
    }

    // --- the driver sees two cards and accepts both; the second acceptance drops the first rider's fare
    const cards = (await driver.agent.get(`/api/journeys/${journey.id}/requests`).expect(200)).body;
    expect(cards.filter((c: { bookingId: string | null }) => c.bookingId)).toHaveLength(2);
    await driver.agent.post(`/api/bookings/${bookings[0]}/accept`).expect(200);
    expect((await ana.agent.get(`/api/bookings/${bookings[0]}`).expect(200)).body.currentFareCents).toBe(300);
    await driver.agent.post(`/api/bookings/${bookings[1]}/accept`).expect(200);
    expect((await ana.agent.get(`/api/bookings/${bookings[0]}`).expect(200)).body.currentFareCents).toBe(200);
    expect((await ana.agent.get('/api/wallet').expect(200)).body).toMatchObject({ balanceCents: 1000, heldCents: 200, availableCents: 800 });

    // --- the passengers can call the driver, the driver can call them
    expect((await ana.agent.get(`/api/bookings/${bookings[0]}/contact`).expect(200)).body).toHaveProperty('phone');

    // --- the trip: start, pick up both, drop off both, complete
    await driver.agent
      .post(`/api/journeys/${journey.id}/start`)
      .send({ locationPermission: true, position: posAt(t, 1.0, 103.0) })
      .expect(200);
    for (const id of bookings) {
      await driver.agent.post(`/api/bookings/${id}/pickup-status`).send({ status: 'PICKED_UP' }).expect(200);
      await driver.agent.post(`/api/bookings/${id}/pickup-status`).send({ status: 'DROPPED_OFF' }).expect(200);
    }
    const done = (await driver.agent.post(`/api/journeys/${journey.id}/complete`).expect(200)).body;
    expect(done.status).toBe('COMPLETED');

    // --- settlement: each rider paid $2.00, the driver earned $4.00, nothing is still on hold
    for (const rider of [ana, ben])
      expect((await rider.agent.get('/api/wallet').expect(200)).body).toMatchObject({ balanceCents: 800, heldCents: 0, debt: null });
    expect((await driver.agent.get('/api/wallet').expect(200)).body).toMatchObject({ balanceCents: 400 });
    const paid = (await ana.agent.get(`/api/bookings/${bookings[0]}`).expect(200)).body;
    expect(paid).toMatchObject({ status: 'COMPLETED', finalFareCents: 200, paymentStatus: 'PAID' });

    // --- ratings both ways, then the history and the notifications
    await ana.agent.post(`/api/bookings/${bookings[0]}/ratings`).send({ stars: 5, comment: 'Smooth ride' }).expect(204);
    await ben.agent.post(`/api/bookings/${bookings[1]}/ratings`).send({ stars: 4 }).expect(204);
    await driver.agent.post(`/api/bookings/${bookings[0]}/ratings`).send({ stars: 5 }).expect(204);
    expect((await ana.agent.post(`/api/bookings/${bookings[0]}/ratings`).send({ stars: 1 })).body.code).toBe('ALREADY_RATED');
    const driverRow = await prisma().user.findUniqueOrThrow({ where: { id: driver.me.id } });
    expect(driverRow.ratingSum / driverRow.ratingCount).toBe(4.5);

    const history = (await ana.agent.get('/api/history').expect(200)).body;
    expect(history[0]).toMatchObject({ kind: 'BOOKING', status: 'COMPLETED', fareCents: 200, paymentOutcome: 'PAID', canRate: false });
    const inbox = (await ana.agent.get('/api/notifications').expect(200)).body;
    const types = inbox.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(expect.arrayContaining(['WALLET_CHECK', 'BOOKING_CONFIRMED', 'FARE_CHANGED', 'TRIP_STARTED', 'TRIP_COMPLETED']));
    expect(inbox.unreadCount).toBeGreaterThan(0);
    await ana.agent.post('/api/notifications/read-all').expect(204);
    expect((await ana.agent.get('/api/notifications').expect(200)).body.unreadCount).toBe(0);
    await expectLedgerReconcilesWithBalances(); // top-ups, holds, deductions and the driver's payout add up to every balance
  });

  it('the last seat wanted by two riders at once: one is confirmed, the other is told SEAT_UNAVAILABLE and keeps their money', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const driver = await signUp(t, 'Dara', 'DRIVER');
    const ana = await signUp(t, 'Ana', 'PASSENGER');
    const ben = await signUp(t, 'Ben', 'PASSENGER');
    await driver.agent.put('/api/driver/profile').send({ vehiclePlate: 'SBA1234A', vehicleModel: 'Toyota Vios', payNowId: '91234567' }).expect(200);
    const preset = (
      await driver.agent
        .post('/api/presets')
        .send({ name: 'Solo', exitGateId: cat.mainGate.id, plan: 'SOLO', allowedPickupTypes: ['BUS_STOP'], detourToleranceMin: 5, exemptionConfirmed: true })
        .expect(201)
    ).body;
    const journey = (
      await driver.agent
        .post('/api/journeys')
        .send({ presetId: preset.id, position: posAt(t, 1.0, 103.0), locationPermission: true })
        .expect(201)
    ).body;
    expect(journey.seatsAvailable).toBe(1);

    const ids: string[] = [];
    for (const rider of [ana, ben]) {
      await rider.agent.post('/api/wallet/top-up').send({ amountCents: 500 }).expect(200);
      ids.push(
        (
          await rider.agent
            .post('/api/bookings')
            .send({ journeyId: journey.id, pickupPointId: cat.pickup.hallBBus.id, dropoffPointId: cat.pickup.gateBus.id })
            .expect(201)
        ).body.id,
      );
    }
    const [a, b] = await Promise.all(ids.map((id) => driver.agent.post(`/api/bookings/${id}/accept`)));
    expect([a!.status, b!.status].sort()).toEqual([200, 409]);
    expect((a!.status === 409 ? a! : b!).body.code).toBe('SEAT_UNAVAILABLE');
    const loser = a!.status === 409 ? ana : ben;
    expect((await loser.agent.get('/api/wallet').expect(200)).body).toMatchObject({ balanceCents: 500, heldCents: 0 });
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: journey.id } })).status).toBe('FULL');
    await expectLedgerReconcilesWithBalances();
  });

  it('a rider on trust (flag ON) who cannot pay: the trip completes, the driver gets what there is, the rider is locked until they top up', async () => {
    const t = makeTestApp();
    t.ctx.flags.bookOnTrust = true;
    const cat = await makeCatalog();
    const driver = await signUp(t, 'Dara', 'DRIVER');
    const sam = await signUp(t, 'Sam', 'PASSENGER');
    await prisma().user.update({ where: { id: sam.me.id }, data: { completedRides: 3 } });
    await driver.agent.put('/api/driver/profile').send({ vehiclePlate: 'SBA1234A', vehicleModel: 'Toyota Vios', payNowId: '91234567' }).expect(200);
    const preset = (
      await driver.agent
        .post('/api/presets')
        .send({ name: 'Solo', exitGateId: cat.mainGate.id, plan: 'SOLO', allowedPickupTypes: ['BUS_STOP'], detourToleranceMin: 5, exemptionConfirmed: true })
        .expect(201)
    ).body;
    const journey = (
      await driver.agent
        .post('/api/journeys')
        .send({ presetId: preset.id, position: posAt(t, 1.0, 103.0), locationPermission: true })
        .expect(201)
    ).body;

    await sam.agent.post('/api/wallet/top-up').send({ amountCents: 230 }).expect(200);
    expect((await sam.agent.get(`/api/bookings/preview?journeyId=${journey.id}`).expect(200)).body.check).toBe('ON_TRUST');
    const booking = (
      await sam.agent
        .post('/api/bookings')
        .send({ journeyId: journey.id, pickupPointId: cat.pickup.hallBBus.id, dropoffPointId: cat.pickup.gateBus.id })
        .expect(201)
    ).body;
    expect(booking.bookedOnTrust).toBe(true);
    await driver.agent.post(`/api/bookings/${booking.id}/accept`).expect(200);
    await driver.agent
      .post(`/api/journeys/${journey.id}/start`)
      .send({ locationPermission: true, position: posAt(t, 1.0, 103.0) })
      .expect(200);
    await driver.agent.post(`/api/bookings/${booking.id}/pickup-status`).send({ status: 'PICKED_UP' }).expect(200);
    await driver.agent.post(`/api/bookings/${booking.id}/pickup-status`).send({ status: 'DROPPED_OFF' }).expect(200);
    await driver.agent.post(`/api/journeys/${journey.id}/complete`).expect(200);

    const wallet = (await sam.agent.get('/api/wallet').expect(200)).body;
    expect(wallet).toMatchObject({ balanceCents: 0, heldCents: 0 });
    expect(wallet.debt.amountCents).toBe(70);
    expect((await sam.agent.get('/api/auth/me').expect(200)).body.accountStatus).toBe('LOCKED');
    // a locked rider cannot ask for a hop or book, but can top up and is then unlocked
    expect((await sam.agent.post('/api/hop-requests').send({ fromLocationId: cat.hallB.id, toLocationId: cat.mainGate.id })).body.code).toBe('ACCOUNT_LOCKED');
    await sam.agent.post('/api/wallet/top-up').send({ amountCents: 100 }).expect(200);
    expect((await sam.agent.get('/api/auth/me').expect(200)).body.accountStatus).toBe('ACTIVE');
    expect((await driver.agent.get('/api/wallet').expect(200)).body.balanceCents).toBe(300);
    await expectLedgerReconcilesWithBalances(); // including the shortfall that became a debt and was paid by the later top-up
  });
});

describe('Q3: the e-mailed code through the REAL SMTP adapter and the Mailpit container (K5, A1)', () => {
  const MAILPIT = process.env.MAILPIT_API ?? 'http://localhost:8025';

  async function reachable() {
    try {
      return (await fetch(`${MAILPIT}/api/v1/info`, { signal: AbortSignal.timeout(1500) })).ok;
    } catch {
      return false;
    }
  }

  it('register -> the code arrives in Mailpit -> verify -> log in', async () => {
    if (!(await reachable())) {
      console.warn('Mailpit is not running on 8025; this check was SKIPPED (docker compose up -d starts it)');
      return;
    }
    const config = parseEnv({ DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: TEST_JWT_SECRET, NODE_ENV: 'test', SMTP_HOST: 'localhost', SMTP_PORT: '1025' });
    const clock = new FakeClock();
    const adapters = createFakeAdapters();
    const logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
    const email = new SmtpEmailAdapter({ host: 'localhost', port: 1025, from: config.EMAIL_FROM }, logger);
    const ctx = createContext({ config, clock, adapters: { ...adapters, email } });
    const app = createApp({ ctx });

    const address = `mailpit.${unique()}@e.ntu.edu.sg`;
    const password = 'correct-horse-battery';
    expect(
      (await request(app).post('/api/auth/register').send({ name: 'Mail Pit', ntuEmail: address, phone: '81234567', password, role: 'PASSENGER' })).status,
    ).toBe(201);

    let code: string | undefined;
    for (let i = 0; i < 20 && !code; i++) {
      const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json()) as { messages?: { ID: string }[] };
      const id = list.messages?.[0]?.ID;
      if (id) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string };
        code = /\b(\d{6})\b/.exec(msg.Text ?? '')?.[1];
      }
      if (!code) await new Promise((r) => setTimeout(r, 250));
    }
    expect(code, 'no e-mail with a 6-digit code reached Mailpit').toMatch(/^\d{6}$/);
    expect((await request(app).post('/api/auth/verify').send({ ntuEmail: address, code })).status).toBe(204);
    expect((await request(app).post('/api/auth/login').send({ ntuEmail: address, password })).status).toBe(200);
  });
});
