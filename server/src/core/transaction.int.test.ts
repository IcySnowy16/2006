/** K3 tests that need a real database: transactions roll back, and two requests cannot take the last seat. */
import { describe, expect, it } from 'vitest';
import { prisma } from './prisma';
import { lockJourney, withTransaction } from './transaction';
import { makeBooking, makeCatalog, makeDriver, makeJourney, makePassenger, makeUser } from '../../test/helpers';

describe('K3: withTransaction', () => {
  it('an error thrown inside leaves no rows written', async () => {
    const before = await prisma().user.count();
    await expect(
      withTransaction(async (tx) => {
        await tx.user.create({ data: { name: 'Rolled Back', ntuEmail: 'rb@e.ntu.edu.sg', phone: '91234567', passwordHash: 'x' } });
        expect(await tx.user.count()).toBe(before + 1); // visible inside
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma().user.count()).toBe(before);
  });

  it('a successful transaction is committed', async () => {
    await withTransaction(async (tx) => {
      await tx.user.create({ data: { name: 'Kept', ntuEmail: 'kept@e.ntu.edu.sg', phone: '91234567', passwordHash: 'x' } });
    });
    expect(await prisma().user.count({ where: { ntuEmail: 'kept@e.ntu.edu.sg' } })).toBe(1);
  });
});

describe('K3: seats never go below zero under concurrent requests (NFR-3.1)', () => {
  it('two concurrent decrements on a 1-seat journey: exactly one succeeds (conditional update)', async () => {
    const driver = await makeDriver();
    const journey = await makeJourney(driver.id, { plan: 'SOLO', seatsAvailable: 1 });
    const take = () => prisma().journey.updateMany({ where: { id: journey.id, seatsAvailable: { gt: 0 } }, data: { seatsAvailable: { decrement: 1 } } });
    const results = await Promise.all([take(), take(), take(), take()]);
    expect(results.map((r) => r.count).sort()).toEqual([0, 0, 0, 1]);
    expect((await prisma().journey.findUniqueOrThrow({ where: { id: journey.id } })).seatsAvailable).toBe(0);
  });

  it('the same with a row lock: read, check and write inside one transaction', async () => {
    const driver = await makeDriver();
    const journey = await makeJourney(driver.id, { plan: 'SOLO', seatsAvailable: 1 });
    const take = () =>
      withTransaction(async (tx) => {
        await lockJourney(tx, journey.id);
        const j = await tx.journey.findUniqueOrThrow({ where: { id: journey.id } });
        if (j.seatsAvailable < 1) return false;
        await tx.journey.update({ where: { id: journey.id }, data: { seatsAvailable: j.seatsAvailable - 1 } });
        return true;
      });
    const results = await Promise.all([take(), take(), take()]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('the database itself refuses a negative seat count (CHECK constraint)', async () => {
    const driver = await makeDriver();
    const journey = await makeJourney(driver.id, { plan: 'SOLO', seatsAvailable: 1 });
    await expect(prisma().journey.update({ where: { id: journey.id }, data: { seatsAvailable: -1 } })).rejects.toThrow();
  });
});

describe('F5: the database enforces the money and ledger rules', () => {
  it('a wallet cannot go negative or hold more than it has', async () => {
    const u = await makeUser({ balanceCents: 100 });
    await expect(prisma().wallet.update({ where: { userId: u.id }, data: { balanceCents: -1 } })).rejects.toThrow();
    await expect(prisma().wallet.update({ where: { userId: u.id }, data: { heldCents: 101 } })).rejects.toThrow();
  });

  it('the wallet ledger is append-only: an update or a delete is refused', async () => {
    const u = await makeUser({ balanceCents: 500 });
    const tx = await prisma().walletTransaction.create({ data: { walletUserId: u.id, type: 'TOP_UP', amountCents: 500 } });
    await expect(prisma().walletTransaction.update({ where: { id: tx.id }, data: { amountCents: 1 } })).rejects.toThrow(/append-only/);
    await expect(prisma().walletTransaction.delete({ where: { id: tx.id } })).rejects.toThrow(/append-only/);
  });

  it('one rating per booking and rater', async () => {
    const cat = await makeCatalog();
    const d = await makeDriver();
    const p = await makePassenger();
    const j = await makeJourney(d.id);
    const b = await makeBooking(j.id, p.id, cat.pickup.hallABus.id, cat.pickup.nieCarpark.id, { status: 'COMPLETED' });
    await prisma().rating.create({ data: { bookingId: b.id, raterId: p.id, rateeId: d.id, stars: 5 } });
    await expect(prisma().rating.create({ data: { bookingId: b.id, raterId: p.id, rateeId: d.id, stars: 4 } })).rejects.toThrow();
    await expect(prisma().rating.create({ data: { bookingId: b.id, raterId: d.id, rateeId: p.id, stars: 6 } })).rejects.toThrow();
  });
});
