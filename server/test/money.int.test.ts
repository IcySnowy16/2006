/**
 * Tasks C1 (fare), C2 (wallet) and C4 (lock/unlock, debt): real PostgreSQL, fake PayNow.
 * UC-20 top up, UC-21 hold/release, UC-13.EX.1 shortfall. Money is integer cents everywhere.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DomainEvents, EventName } from '../src/events/events';
import { prisma } from '../src/core/prisma';
import { withTransaction } from '../src/core/transaction';
import { EventQueue } from '../src/events/bus';
import { AccountLockService } from '../src/services/AccountLockService';
import { FareService } from '../src/services/FareService';
import { WalletService } from '../src/services/WalletService';
import { expectError, makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger } from './helpers';
import { makeTestApp } from './helpers/app';

/** A passenger, a driver, a journey and one booking, ready for money tests. */
async function scene(
  opts: {
    balanceCents?: number;
    heldCents?: number;
    bookingHeld?: number;
    fare?: number;
    pickupStatus?: 'WAITING' | 'DROPPED_OFF';
    status?: 'PENDING' | 'CONFIRMED' | 'COMPLETED';
  } = {},
) {
  const cat = await makeCatalog();
  const driver = await makeDriver();
  const passenger = await makePassenger({ balanceCents: opts.balanceCents ?? 0, heldCents: opts.heldCents ?? 0 });
  const journey = await makeJourney(driver.id, { status: 'OPEN' });
  const booking = await makeBooking(journey.id, passenger.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
    status: opts.status ?? 'CONFIRMED',
    pickupStatus: opts.pickupStatus ?? 'WAITING',
    currentFareCents: opts.fare ?? 300,
    heldCents: opts.bookingHeld ?? opts.heldCents ?? 0,
  });
  return { cat, driver, passenger, journey, booking };
}

const record = (t: ReturnType<typeof makeTestApp>) => {
  const seen: { name: EventName; payload: unknown }[] = [];
  for (const name of ['FareChanged', 'DebtRecorded', 'AccountLocked', 'AccountUnlocked'] as const) {
    t.ctx.bus.on(name, (payload: DomainEvents[typeof name]) => void seen.push({ name, payload }));
  }
  return seen;
};

describe('C2: wallet over HTTP (UC-20)', () => {
  it('GET /api/wallet shows balance, held, available, no debt and says SIMULATED', async () => {
    const t = makeTestApp();
    const u = await makePassenger({ balanceCents: 1000, heldCents: 300 });
    const res = await request(t.app).get('/api/wallet').set('Cookie', t.cookieFor(u));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balanceCents: 1000, heldCents: 300, availableCents: 700, debt: null, simulated: true });
  });

  it('a top-up credits the wallet, writes one TOP_UP ledger row and goes through the simulated PayNow adapter', async () => {
    const t = makeTestApp();
    const u = await makePassenger();
    const res = await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(1000);
    expect(t.adapters.payNow.topUps).toEqual([{ userId: u.id, cents: 1000 }]);
    const ledger = await request(t.app).get('/api/wallet/transactions').set('Cookie', t.cookieFor(u));
    expect(ledger.body).toHaveLength(1);
    expect(ledger.body[0]).toMatchObject({ type: 'TOP_UP', amountCents: 1000, bookingId: null });
  });

  it('a top-up that would take the wallet over $100 is a VALIDATION_ERROR and changes nothing (NFR-6.5)', async () => {
    const t = makeTestApp();
    const u = await makePassenger({ balanceCents: 9_000 });
    const res = await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: 2000 });
    expectError(res, 'VALIDATION_ERROR');
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: u.id } })).balanceCents).toBe(9_000);
    expect(await prisma().walletTransaction.count()).toBe(0);
  });

  it('exactly $100 is allowed; the amount itself must be a whole number of cents between 100 and 10000 (so a negative or zero amount is refused)', async () => {
    const t = makeTestApp();
    const u = await makePassenger({ balanceCents: 9_000 });
    expect((await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: 1000 })).body.balanceCents).toBe(10_000);
    for (const bad of [-500, 0, 10_001]) {
      expectError(await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: bad }), 'VALIDATION_ERROR');
    }
    expectError(await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: 12.5 }), 'VALIDATION_ERROR');
    expectError(await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: 50 }), 'VALIDATION_ERROR');
  });

  it('when PayNow is unavailable nothing is written (EXTERNAL_SERVICE_UNAVAILABLE)', async () => {
    const t = makeTestApp();
    const u = await makePassenger();
    t.adapters.payNow.failNext();
    expectError(await request(t.app).post('/api/wallet/top-up').set('Cookie', t.cookieFor(u)).send({ amountCents: 500 }), 'EXTERNAL_SERVICE_UNAVAILABLE');
    expect(await prisma().walletTransaction.count()).toBe(0);
  });

  it('withdrawal: a driver takes what is available as PAYOUT; more than available is INSUFFICIENT_BALANCE; the flag turns it off', async () => {
    const t = makeTestApp();
    const d = await makeDriver({ balanceCents: 800, heldCents: 0 });
    const ok = await request(t.app).post('/api/wallet/withdraw').set('Cookie', t.cookieFor(d)).send({ amountCents: 500 });
    expect(ok.body.balanceCents).toBe(300);
    expectError(await request(t.app).post('/api/wallet/withdraw').set('Cookie', t.cookieFor(d)).send({ amountCents: 500 }), 'INSUFFICIENT_BALANCE');
    const off = makeTestApp({ FEATURE_WITHDRAWALS: 'false' });
    // flags are read from process.env at context creation, so switch the one flag on the context directly
    off.ctx.flags.withdrawals = false;
    expectError(await request(off.app).post('/api/wallet/withdraw').set('Cookie', off.cookieFor(d)).send({ amountCents: 100 }), 'NOT_IMPLEMENTED');
  });

  it('a passenger cannot call the driver-only withdraw route', async () => {
    const t = makeTestApp();
    const p = await makePassenger({ balanceCents: 500 });
    expectError(await request(t.app).post('/api/wallet/withdraw').set('Cookie', t.cookieFor(p)).send({ amountCents: 100 }), 'FORBIDDEN');
  });
});

describe('C2: hold, release, adjust, deduct (UC-21)', () => {
  it('hold more than available -> INSUFFICIENT_BALANCE and nothing is written (UC-21.EX.1)', async () => {
    const t = makeTestApp();
    const { booking, passenger } = await scene({ balanceCents: 250, status: 'PENDING', bookingHeld: 0 });
    const wallets = new WalletService(t.ctx);
    await expect(withTransaction((tx) => wallets.hold(tx, booking.id, 300))).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await prisma().walletTransaction.count()).toBe(0);
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: passenger.id } })).heldCents).toBe(0);
  });

  it('two parallel holds that together exceed the balance: exactly one succeeds (NFR-3.4)', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const driver = await makeDriver();
    const passenger = await makePassenger({ balanceCents: 300 });
    const j1 = await makeJourney(driver.id);
    const j2 = await makeJourney((await makeDriver()).id);
    const b1 = await makeBooking(j1.id, passenger.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id);
    const b2 = await makeBooking(j2.id, passenger.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id);
    const wallets = new WalletService(t.ctx);
    const results = await Promise.allSettled([withTransaction((tx) => wallets.hold(tx, b1.id, 200)), withTransaction((tx) => wallets.hold(tx, b2.id, 200))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: passenger.id } })).heldCents).toBe(200);
  });

  it('release gives back exactly what hold took, and the ledger agrees with the wallet after a sequence', async () => {
    const t = makeTestApp();
    const { booking, passenger } = await scene({ balanceCents: 1000, status: 'PENDING', bookingHeld: 0 });
    const wallets = new WalletService(t.ctx);
    await withTransaction((tx) => wallets.hold(tx, booking.id, 300));
    await withTransaction((tx) => wallets.release(tx, booking.id));
    await withTransaction((tx) => wallets.hold(tx, booking.id, 200));
    const taken = await withTransaction((tx) => wallets.deduct(tx, booking.id, 200));
    expect(taken).toEqual({ takenCents: 200, shortfallCents: 0 });

    const w = await prisma().wallet.findUniqueOrThrow({ where: { userId: passenger.id } });
    expect(w).toMatchObject({ balanceCents: 800, heldCents: 0 });
    const rows = await prisma().walletTransaction.findMany({ where: { walletUserId: passenger.id } });
    const sum = (type: string) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.amountCents, 0);
    expect(sum('HOLD') - sum('RELEASE') - sum('DEDUCT')).toBe(w.heldCents);
    expect(1000 + sum('TOP_UP') - sum('DEDUCT')).toBe(w.balanceCents);
  });

  it('adjustHold moves the hold by the difference: down releases, up holds', async () => {
    const t = makeTestApp();
    const { booking, passenger } = await scene({ balanceCents: 1000, heldCents: 300, bookingHeld: 300 });
    const wallets = new WalletService(t.ctx);
    await withTransaction((tx) => wallets.adjustHold(tx, booking.id, 200));
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: passenger.id } })).heldCents).toBe(200);
    await withTransaction((tx) => wallets.adjustHold(tx, booking.id, 300));
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: passenger.id } })).heldCents).toBe(300);
    expect((await prisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).heldCents).toBe(300);
  });

  it('deduct takes the hold first, then free money; what cannot be covered is the shortfall', async () => {
    const t = makeTestApp();
    const { booking, passenger } = await scene({ balanceCents: 100, heldCents: 100, bookingHeld: 100, fare: 300 });
    const result = await withTransaction((tx) => new WalletService(t.ctx).deduct(tx, booking.id, 300));
    expect(result).toEqual({ takenCents: 100, shortfallCents: 200 });
    expect(await prisma().wallet.findUniqueOrThrow({ where: { userId: passenger.id } })).toMatchObject({ balanceCents: 0, heldCents: 0 });
  });

  it('credit adds to the DRIVER wallet with the booking id on the ledger row (FR 10.6)', async () => {
    const t = makeTestApp();
    const { booking, driver } = await scene();
    await withTransaction((tx) => new WalletService(t.ctx).credit(tx, driver.id, 300, booking.id));
    const w = await prisma().wallet.findUniqueOrThrow({ where: { userId: driver.id } });
    expect(w.balanceCents).toBe(300);
    expect(await prisma().walletTransaction.findFirstOrThrow({ where: { walletUserId: driver.id } })).toMatchObject({
      type: 'CREDIT',
      bookingId: booking.id,
      amountCents: 300,
    });
  });
});

describe('C1: FareService', () => {
  const fares = new FareService(makeTestApp().ctx, undefined as never);

  it.each([
    [1, 300],
    [2, 200],
    [3, 200],
  ])('%i rider(s) -> %i cents each', (riders, cents) => {
    expect(fares.fareForRiders(riders)).toBe(cents);
  });

  it.each([0, 4, -1, 1.5])('%s riders is not a price: VALIDATION_ERROR', (riders) => {
    expect(() => fares.fareForRiders(riders)).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('retier: one rider (300) then a second confirms -> both 200, two FareChanged events, each hold falls by 100', async () => {
    const t = makeTestApp();
    const events = record(t);
    const cat = await makeCatalog();
    const driver = await makeDriver();
    const journey = await makeJourney(driver.id, { status: 'OPEN' });
    const a = await makePassenger({ balanceCents: 1000, heldCents: 300 });
    const b = await makePassenger({ balanceCents: 1000, heldCents: 300 });
    const ba = await makeBooking(journey.id, a.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
      status: 'CONFIRMED',
      currentFareCents: 300,
      heldCents: 300,
    });
    const bb = await makeBooking(journey.id, b.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, {
      status: 'CONFIRMED',
      currentFareCents: 300,
      heldCents: 300,
    });

    const queue = new EventQueue();
    const wallets = new WalletService(t.ctx);
    const fare = await withTransaction((tx) => new FareService(t.ctx, wallets).retier(tx, queue, journey.id));
    await t.ctx.bus.publish(queue);

    expect(fare).toBe(200);
    for (const [booking, user] of [
      [ba, a],
      [bb, b],
    ] as const) {
      expect((await prisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).currentFareCents).toBe(200);
      expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: user.id } })).heldCents).toBe(200);
    }
    expect(events.filter((e) => e.name === 'FareChanged')).toHaveLength(2);
    expect(events.find((e) => e.name === 'FareChanged')!.payload).toMatchObject({ oldCents: 300, newCents: 200 });
  });

  it('a rider marked NO_SHOW no longer counts toward the headcount', async () => {
    const t = makeTestApp();
    const cat = await makeCatalog();
    const driver = await makeDriver();
    const journey = await makeJourney(driver.id, { status: 'OPEN' });
    const a = await makePassenger();
    const b = await makePassenger();
    await makeBooking(journey.id, a.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', pickupStatus: 'PICKED_UP' });
    await makeBooking(journey.id, b.id, cat.pickup.hallABus.id, cat.pickup.gateBus.id, { status: 'CONFIRMED', pickupStatus: 'NO_SHOW' });
    const f = new FareService(t.ctx, new WalletService(t.ctx));
    expect(await f.currentFare(journey.id)).toBe(300);
    expect(await f.finalFare(journey.id)).toBe(300);
    expect(await f.fareIfJoining(journey.id)).toBe(200);
  });
});

describe('C4: shortfall, lock and unlock (UC-13.EX.1, UC-20 step 5)', () => {
  async function shortfallScene(t: ReturnType<typeof makeTestApp>, shortfall = 200) {
    const s = await scene({ balanceCents: 0, status: 'COMPLETED', pickupStatus: 'DROPPED_OFF', fare: 300 });
    await prisma().user.update({ where: { id: s.passenger.id }, data: { accountStatus: 'ACTIVE' } });
    const queue = new EventQueue();
    await withTransaction((tx) => new AccountLockService(t.ctx, new WalletService(t.ctx)).recordShortfall(tx, queue, s.booking.id, shortfall));
    await t.ctx.bus.publish(queue);
    return s;
  }

  it('a shortfall creates the Debt, marks the booking UNPAID, locks the user and emits DebtRecorded + AccountLocked', async () => {
    const t = makeTestApp();
    const events = record(t);
    const s = await shortfallScene(t);
    const debt = await prisma().debt.findFirstOrThrow({ where: { userId: s.passenger.id } });
    expect(debt).toMatchObject({ amountCents: 200, clearedAt: null, bookingId: s.booking.id });
    const user = await prisma().user.findUniqueOrThrow({ where: { id: s.passenger.id } });
    expect(user).toMatchObject({ accountStatus: 'LOCKED', unpaidCount: 1 });
    expect(await prisma().booking.findUniqueOrThrow({ where: { id: s.booking.id } })).toMatchObject({ pickupStatus: 'UNPAID', paymentStatus: 'UNPAID' });
    expect(events.map((e) => e.name).sort()).toEqual(['AccountLocked', 'DebtRecorded']);
    // the wallet screen shows the exact shortfall
    const wallet = await request(t.app).get('/api/wallet').set('Cookie', t.cookieFor(s.passenger));
    expect(wallet.body.debt.amountCents).toBe(200);
  });

  it('a top-up smaller than the debt leaves the account LOCKED; equal to the debt unlocks it, clears the Debt and credits the driver (boundary)', async () => {
    const t = makeTestApp();
    const events = record(t);
    const s = await shortfallScene(t, 300);
    const cookie = t.cookieFor(s.passenger);

    const first = await request(t.app).post('/api/wallet/top-up').set('Cookie', cookie).send({ amountCents: 200 });
    expect(first.body.debt.amountCents).toBe(300);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: s.passenger.id } })).accountStatus).toBe('LOCKED');

    const second = await request(t.app).post('/api/wallet/top-up').set('Cookie', cookie).send({ amountCents: 100 });
    expect(second.body).toMatchObject({ balanceCents: 0, debt: null });
    expect((await prisma().user.findUniqueOrThrow({ where: { id: s.passenger.id } })).accountStatus).toBe('ACTIVE');
    expect((await prisma().debt.findFirstOrThrow({ where: { userId: s.passenger.id } })).clearedAt).not.toBeNull();
    expect((await prisma().wallet.findUniqueOrThrow({ where: { userId: s.driver.id } })).balanceCents).toBe(300);
    expect(events.map((e) => e.name)).toContain('AccountUnlocked');
  });

  it('a locked passenger can still see the wallet and top up (FR 10.8)', async () => {
    const t = makeTestApp();
    const s = await shortfallScene(t);
    const cookie = t.cookieFor(s.passenger);
    expect((await request(t.app).get('/api/wallet').set('Cookie', cookie)).status).toBe(200);
    expect((await request(t.app).post('/api/wallet/top-up').set('Cookie', cookie).send({ amountCents: 100 })).status).toBe(200);
  });
});
