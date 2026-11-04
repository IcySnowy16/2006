/**
 * Task Q1 (Lab 4 black-box testing of the fare calculation).
 *
 * The expected values come from the SRS, NOT from reading the code (FR 5.1.1: one rider pays $3.00; FR 5.1.2: two or three riders pay
 * $2.00 each; a trip carries 1 to 3 riders, FR 3.1.2). The equivalence classes of `calculateFare(riders)` are:
 *
 *   EC1  riders below 1          invalid  -> error      boundary values 0 (and -1)
 *   EC2  exactly 1 rider         valid    -> 300 cents  boundary values 1
 *   EC3  2 or 3 riders           valid    -> 200 cents  boundary values 2 and 3
 *   EC4  riders above 3          invalid  -> error      boundary value 4
 *   EC5  not a whole number      invalid  -> error      (1.5)
 *
 * The minimised set is one case per class plus every boundary, with no duplicates: 0, 1, 2, 3, 4 (-1 and 1.5 are extra invalid
 * inputs of the same class EC1 and are kept only as a guard against a non-integer slipping through). The same table is in
 * docs/tests/black-box-fare.md with the Actual Output copied from a real run.
 */
import { describe, expect, it } from 'vitest';
import { FareTier } from '../entities/FareTier';
import { Money } from '../core/money';
import { FareService } from './FareService';

const fares = new FareService({} as never, {} as never);

/** [test id, class, input, expected cents or 'VALIDATION_ERROR'] */
export const BLACK_BOX_CASES = [
  ['TC1', 'EC1 below 1 (boundary)', 0, 'VALIDATION_ERROR'],
  ['TC2', 'EC2 one rider (boundary)', 1, 300],
  ['TC3', 'EC3 two riders (boundary)', 2, 200],
  ['TC4', 'EC3 three riders (boundary)', 3, 200],
  ['TC5', 'EC4 above 3 (boundary)', 4, 'VALIDATION_ERROR'],
  ['TC6', 'EC1 well below 1', -1, 'VALIDATION_ERROR'],
  ['TC7', 'EC5 not a whole number of riders', 1.5, 'VALIDATION_ERROR'],
] as const;

describe('Q1: calculateFare, equivalence classes and boundaries (FR 5.1.1, 5.1.2)', () => {
  it.each(BLACK_BOX_CASES)('%s %s: riders=%s -> %s', (_id, _class, riders, expected) => {
    if (expected === 'VALIDATION_ERROR') {
      expect(() => FareTier.calculateFare(riders)).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
      expect(() => fares.fareForRiders(riders)).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    } else {
      expect(FareTier.calculateFare(riders)).toBe(expected);
      expect(fares.fareForRiders(riders)).toBe(expected);
    }
  });

  it("the per-rider fare never goes UP when a rider joins (so a second rider can only lower the first rider's fare)", () => {
    expect(FareTier.calculateFare(2)).toBeLessThan(FareTier.calculateFare(1));
    expect(FareTier.calculateFare(3)).toBeLessThanOrEqual(FareTier.calculateFare(2));
  });

  it('money is formatted from whole cents: 300 is $3.00 and 200 is $2.00 (no float arithmetic)', () => {
    expect(Money.cents(FareTier.calculateFare(1)).format()).toBe('$3.00');
    expect(Money.cents(FareTier.calculateFare(2)).format()).toBe('$2.00');
    expect(() => Money.cents(2.5)).toThrow(RangeError);
  });

  it('retier: a second rider confirms and the first rider fare changes from 300 to 200, both holds fall by 100, two FareChanged events', async () => {
    // an in-memory stand-in for the transaction, so the rule is tested without a database (the database version is in money.int.test.ts)
    const rows = [
      { id: 'b1', passengerId: 'p1', currentFareCents: 300, status: 'CONFIRMED', pickupStatus: 'WAITING', createdAt: 1 },
      { id: 'b2', passengerId: 'p2', currentFareCents: 300, status: 'CONFIRMED', pickupStatus: 'WAITING', createdAt: 2 },
    ];
    const tx = {
      booking: {
        findMany: async () => rows.map((r) => ({ ...r })),
        update: async ({ where, data }: { where: { id: string }; data: { currentFareCents: number } }) =>
          void Object.assign(
            rows.find((r) => r.id === where.id)!,
            data,
          ),
      },
    };
    const holds: [string, number][] = [];
    const service = new FareService(
      { flags: { fareLock: true } } as never,
      { adjustHold: async (_tx: unknown, id: string, cents: number) => void holds.push([id, cents]) } as never,
    );
    const events: { name: string; payload: unknown }[] = [];
    const queue = { push: (name: string, payload: unknown) => void events.push({ name, payload }) };

    expect(await service.retier(tx as never, queue as never, 'j1')).toBe(200);
    expect(rows.map((r) => r.currentFareCents)).toEqual([200, 200]);
    expect(holds).toEqual([
      ['b1', 200],
      ['b2', 200],
    ]);
    expect(events).toEqual([
      { name: 'FareChanged', payload: { bookingId: 'b1', passengerId: 'p1', oldCents: 300, newCents: 200 } },
      { name: 'FareChanged', payload: { bookingId: 'b2', passengerId: 'p2', oldCents: 300, newCents: 200 } },
    ]);
    // running it again changes nothing
    events.length = 0;
    await service.retier(tx as never, queue as never, 'j1');
    expect(events).toEqual([]);
  });
});
