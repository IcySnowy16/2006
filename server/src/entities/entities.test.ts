import { describe, expect, it } from 'vitest';
import type { BookingStatus, JourneyStatus, PickupStatus } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';
import { Money } from '../core/money';
import { Booking, BOOKING_TRANSITIONS, PICKUP_TRANSITIONS, type BookingRecord } from './Booking';
import { CampusLocation } from './CampusLocation';
import { Debt } from './Debt';
import { Driver } from './Driver';
import { DriverPreset, type DriverPresetRecord } from './DriverPreset';
import { FareTier } from './FareTier';
import { HopRequest } from './HopRequest';
import { Journey, JOURNEY_TRANSITIONS, type JourneyRecord } from './Journey';
import { LocationUpdate } from './LocationUpdate';
import { MatchResultSet, type MatchCandidate } from './MatchResultSet';
import { Notification } from './Notification';
import { Passenger } from './Passenger';
import { Rating } from './Rating';
import { Route } from './Route';
import { User, type UserRecord } from './User';
import { Wallet } from './Wallet';
import { WalletTransaction } from './WalletTransaction';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : `NOT_APPERROR:${(e as Error).message}`;
  }
  return undefined;
};

const NOW = new Date('2026-10-19T08:00:00.000Z');

// ------------------------------------------------------------------------------------------------ F7a
const userRec = (over: Partial<UserRecord> = {}): UserRecord => ({
  id: 'u1',
  name: 'Ann Lee',
  ntuEmail: 'ann@e.ntu.edu.sg',
  phone: '91234567',
  passwordHash: '',
  isDriver: false,
  isPassenger: true,
  lastActiveRole: null,
  accountStatus: 'ACTIVE',
  pushEnabled: true,
  completedRides: 0,
  unpaidCount: 0,
  ratingSum: 0,
  ratingCount: 0,
  ...over,
});

describe('F7a: User', () => {
  it('verifyEmail moves PENDING_VERIFICATION to ACTIVE and refuses a second time', () => {
    const u = User.fromRecord(userRec({ accountStatus: 'PENDING_VERIFICATION' }));
    u.verifyEmail();
    expect(u.accountStatus).toBe('ACTIVE');
    expect(code(() => u.verifyEmail())).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('lock and unlock: only ACTIVE can be locked, only LOCKED unlocked', () => {
    const u = User.fromRecord(userRec());
    expect(code(() => u.unlock())).toBe('ILLEGAL_STATE_TRANSITION');
    u.lock('debt');
    expect(u.accountStatus).toBe('LOCKED');
    expect(code(() => u.lock('again'))).toBe('ILLEGAL_STATE_TRANSITION');
    u.unlock();
    expect(u.accountStatus).toBe('ACTIVE');
    expect(code(() => User.fromRecord(userRec({ accountStatus: 'PENDING_VERIFICATION' })).lock('x'))).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('checkPassword compares with bcrypt', async () => {
    const bcrypt = await import('bcryptjs');
    const u = User.fromRecord(userRec({ passwordHash: await bcrypt.hash('correct horse', 4) }));
    expect(await u.checkPassword('correct horse')).toBe(true);
    expect(await u.checkPassword('wrong')).toBe(false);
  });

  it('roles: holds, addRole and chooseActiveRole (a role the user does not hold is FORBIDDEN)', () => {
    const u = User.fromRecord(userRec());
    expect(u.roles).toEqual(['PASSENGER']);
    expect(code(() => u.chooseActiveRole('DRIVER'))).toBe('FORBIDDEN');
    u.addRole('DRIVER');
    expect(u.roles).toEqual(['DRIVER', 'PASSENGER']);
    expect(code(() => u.addRole('DRIVER'))).toBe('CONFLICT');
    u.chooseActiveRole('DRIVER');
    expect(u.toRecord().lastActiveRole).toBe('DRIVER');
  });

  it('the average rating is null before the first rating, then rounded to one decimal', () => {
    const u = User.fromRecord(userRec());
    expect(u.averageRating).toBeNull();
    u.recordRating(5);
    u.recordRating(4);
    u.recordRating(4);
    expect(u.averageRating).toBe(4.3);
  });

  it('firstName is the first word of the name', () => {
    expect(User.fromRecord(userRec({ name: '  Ann Marie Lee ' })).firstName).toBe('Ann');
  });
});

describe('F7a: Passenger trust rule (FR 10.3)', () => {
  it('needs 3 completed rides: 2 is not enough, 3 is', () => {
    const u = User.fromRecord(userRec({ completedRides: 2 }));
    const p = new Passenger(u);
    expect(p.isEligibleForTrustBooking()).toBe(false);
    p.incrementCompletedRides();
    expect(p.completedRides).toBe(3);
    expect(p.isEligibleForTrustBooking()).toBe(true);
    p.incrementUnpaidCount();
    expect(p.unpaidCount).toBe(1);
  });
});

describe('F7a: Driver daily limit (FR 6.4)', () => {
  const rec = (over = {}) => ({
    userId: 'd1',
    vehiclePlate: 'SBA1234A',
    vehicleModel: 'Toyota Vios',
    payNowId: '91234567',
    dailyPaidTrips: 0,
    lastPaidTripDate: null as string | null,
    ...over,
  });

  it('1 trip is allowed, 2 reaches the limit', () => {
    const d = Driver.fromRecord(rec());
    expect(d.hasReachedDailyLimit(NOW)).toBe(false);
    d.incrementDailyTrips(NOW);
    expect(d.hasReachedDailyLimit(NOW)).toBe(false);
    d.incrementDailyTrips(NOW);
    expect(d.hasReachedDailyLimit(NOW)).toBe(true);
  });

  it('a counter left over from yesterday counts as 0 today, even if the midnight job never ran', () => {
    const d = Driver.fromRecord(rec({ dailyPaidTrips: 2, lastPaidTripDate: '2026-10-18' }));
    expect(d.hasReachedDailyLimit(NOW)).toBe(false);
    d.incrementDailyTrips(NOW);
    expect(d.toRecord()).toMatchObject({ dailyPaidTrips: 1, lastPaidTripDate: '2026-10-19' });
  });

  it('the day changes at midnight Singapore time', () => {
    const d = Driver.fromRecord(rec({ dailyPaidTrips: 2, lastPaidTripDate: '2026-10-19' }));
    expect(d.hasReachedDailyLimit(new Date('2026-10-19T15:59:00Z'))).toBe(true);
    expect(d.hasReachedDailyLimit(new Date('2026-10-19T16:00:00Z'))).toBe(false);
  });

  it('resetDailyTripCounter sets it to 0', () => {
    const d = Driver.fromRecord(rec({ dailyPaidTrips: 2, lastPaidTripDate: '2026-10-19' }));
    d.resetDailyTripCounter();
    expect(d.hasReachedDailyLimit(NOW)).toBe(false);
  });
});

describe('F7a: DriverPreset', () => {
  const rec = (over: Partial<DriverPresetRecord> = {}): DriverPresetRecord => ({
    id: 'p1',
    driverId: 'd1',
    name: 'Home',
    exitGateId: 'g1',
    plan: 'SHARING',
    allowedPickupTypes: ['BUS_STOP'],
    detourToleranceMin: 5,
    scheduleDays: [],
    scheduleDepartAt: null,
    exemptionConfirmedAt: null,
    ...over,
  });

  it('tolerance 5 is accepted, 6 and -1 are VALIDATION_ERROR', () => {
    expect(DriverPreset.fromRecord(rec({ detourToleranceMin: 5 })).withinDetourTolerance(5)).toBe(true);
    expect(code(() => DriverPreset.fromRecord(rec({ detourToleranceMin: 6 })))).toBe('VALIDATION_ERROR');
    expect(code(() => DriverPreset.fromRecord(rec({ detourToleranceMin: -1 })))).toBe('VALIDATION_ERROR');
  });

  it('needs a pickup type and a name', () => {
    expect(code(() => DriverPreset.fromRecord(rec({ allowedPickupTypes: [] })))).toBe('VALIDATION_ERROR');
    expect(code(() => DriverPreset.fromRecord(rec({ name: '  ' })))).toBe('VALIDATION_ERROR');
  });

  it('matchesPickupType, withinDetourTolerance and seats', () => {
    const p = DriverPreset.fromRecord(rec({ detourToleranceMin: 3, allowedPickupTypes: ['CARPARK'] }));
    expect(p.matchesPickupType('CARPARK')).toBe(true);
    expect(p.matchesPickupType('BUS_STOP')).toBe(false);
    expect(p.withinDetourTolerance(3)).toBe(true);
    expect(p.withinDetourTolerance(3.1)).toBe(false);
    expect(p.seats).toBe(3);
    expect(DriverPreset.fromRecord(rec({ plan: 'SOLO' })).seats).toBe(1);
  });

  it('confirmExemption records the declaration (FR 3.1.6)', () => {
    const p = DriverPreset.fromRecord(rec());
    expect(p.exemptionConfirmed).toBe(false);
    p.confirmExemption(NOW);
    expect(p.exemptionConfirmed).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ F7b
const journeyRec = (over: Partial<JourneyRecord> = {}): JourneyRecord => ({
  id: 'j1',
  driverId: 'd1',
  presetId: 'p1',
  status: 'LIVE',
  cancelReason: null,
  plan: 'SHARING',
  seatsAvailable: 3,
  departureTime: NOW,
  liveExpiresAt: NOW,
  startedAt: null,
  completedAt: null,
  outsideReadings: 0,
  ...over,
});
const ALL_JOURNEY: JourneyStatus[] = ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

describe('F7b: Journey state machine (A)', () => {
  it('every (from, to) pair is either allowed or throws ILLEGAL_STATE_TRANSITION', () => {
    for (const from of ALL_JOURNEY) {
      for (const to of ALL_JOURNEY) {
        const j = Journey.fromRecord(journeyRec({ status: from }));
        expect(j.canMoveTo(to), `${from} -> ${to}`).toBe(JOURNEY_TRANSITIONS[from].includes(to));
      }
    }
    expect(code(() => Journey.fromRecord(journeyRec({ status: 'COMPLETED' })).cancel('DRIVER'))).toBe('ILLEGAL_STATE_TRANSITION');
    expect(code(() => Journey.fromRecord(journeyRec({ status: 'IN_PROGRESS' })).cancel('DRIVER'))).toBe('ILLEGAL_STATE_TRANSITION');
    expect(code(() => Journey.fromRecord(journeyRec({ status: 'OPEN' })).expire())).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('seats: 3 -> OPEN -> OPEN -> FULL; the 4th is SEAT_UNAVAILABLE; a freed seat reopens a FULL journey', () => {
    const j = Journey.fromRecord(journeyRec());
    j.decrementSeats();
    expect([j.status, j.seatsAvailable]).toEqual(['OPEN', 2]);
    j.decrementSeats();
    j.decrementSeats();
    expect([j.status, j.seatsAvailable, j.isFull()]).toEqual(['FULL', 0, true]);
    expect(code(() => j.decrementSeats())).toBe('SEAT_UNAVAILABLE');
    j.incrementSeats();
    expect([j.status, j.seatsAvailable]).toEqual(['OPEN', 1]);
  });

  it('when the last confirmed rider leaves, the journey is LIVE again (so it can expire), not OPEN for ever', () => {
    const j = Journey.fromRecord(journeyRec());
    j.decrementSeats();
    j.decrementSeats();
    j.incrementSeats();
    expect([j.status, j.seatsAvailable]).toEqual(['OPEN', 2]); // one rider left: still OPEN
    j.incrementSeats();
    expect([j.status, j.seatsAvailable]).toEqual(['LIVE', 3]);
  });

  it('a SOLO journey is FULL after one booking, straight from LIVE', () => {
    const j = Journey.fromRecord(journeyRec({ plan: 'SOLO', seatsAvailable: 1 }));
    j.decrementSeats();
    expect(j.status).toBe('FULL');
    expect(j.capacity).toBe(1);
  });

  it('a seat cannot be given back beyond the capacity', () => {
    expect(code(() => Journey.fromRecord(journeyRec()).incrementSeats())).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('start needs at least one confirmed booking (UC-12), then complete', () => {
    const j = Journey.fromRecord(journeyRec({ status: 'OPEN', seatsAvailable: 2 }));
    expect(code(() => j.start(0, NOW))).toBe('ILLEGAL_STATE_TRANSITION');
    j.start(1, NOW);
    expect(j.status).toBe('IN_PROGRESS');
    expect(code(() => j.decrementSeats())).toBe('ILLEGAL_STATE_TRANSITION');
    j.complete(NOW);
    expect(j.toRecord()).toMatchObject({ status: 'COMPLETED', completedAt: NOW });
  });

  it('cancel records the reason; expire records EXPIRED', () => {
    const a = Journey.fromRecord(journeyRec());
    a.cancel('GEOFENCE');
    expect(a.toRecord()).toMatchObject({ status: 'CANCELLED', cancelReason: 'GEOFENCE' });
    const b = Journey.fromRecord(journeyRec());
    b.expire();
    expect(b.toRecord()).toMatchObject({ status: 'EXPIRED', cancelReason: 'EXPIRED' });
  });

  it('isOpenForBooking is true only for LIVE or OPEN with a free seat', () => {
    expect(Journey.fromRecord(journeyRec()).isOpenForBooking()).toBe(true);
    expect(Journey.fromRecord(journeyRec({ status: 'FULL', seatsAvailable: 0 })).isOpenForBooking()).toBe(false);
    expect(Journey.fromRecord(journeyRec({ status: 'IN_PROGRESS' })).isOpenForBooking()).toBe(false);
  });
});

const bookingRec = (over: Partial<BookingRecord> = {}): BookingRecord => ({
  id: 'b1',
  journeyId: 'j1',
  passengerId: 'u1',
  hopRequestId: null,
  status: 'PENDING',
  pickupStatus: 'WAITING',
  paymentStatus: null,
  bookedOnTrust: false,
  currentFareCents: 300,
  finalFareCents: null,
  heldCents: 0,
  pickupPointId: 'pp1',
  dropoffPointId: 'pp2',
  confirmedAt: null,
  arrivedAt: null,
  ...over,
});
const ALL_BOOKING: BookingStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
const ALL_PICKUP: PickupStatus[] = ['WAITING', 'APPROACHING', 'ARRIVED', 'PICKED_UP', 'DROPPED_OFF', 'NO_SHOW', 'UNPAID'];

describe('F7b: Booking state machines (B and C)', () => {
  it('the status table: every pair is allowed or refused with ILLEGAL_STATE_TRANSITION', () => {
    for (const from of ALL_BOOKING) {
      for (const to of ALL_BOOKING) {
        const b = Booking.fromRecord(bookingRec({ status: from }));
        const call = (): void => {
          if (to === 'CONFIRMED') b.confirm(NOW, 300, 'HELD');
          else if (to === 'CANCELLED') b.cancel();
          else if (to === 'COMPLETED') b.complete(300);
          else throw new AppError('ILLEGAL_STATE_TRANSITION'); // nothing returns to PENDING
        };
        if (BOOKING_TRANSITIONS[from].includes(to)) expect(code(call), `${from} -> ${to}`).toBeUndefined();
        else expect(code(call), `${from} -> ${to}`).toBe('ILLEGAL_STATE_TRANSITION');
      }
    }
  });

  it('the pickup table: every pair is allowed or refused', () => {
    for (const from of ALL_PICKUP) {
      for (const to of ALL_PICKUP) {
        const b = Booking.fromRecord(bookingRec({ status: 'CONFIRMED', pickupStatus: from }));
        const result = code(() => b.updatePickupStatus(to, NOW));
        if (PICKUP_TRANSITIONS[from].includes(to)) expect(result, `${from} -> ${to}`).toBeUndefined();
        else expect(result, `${from} -> ${to}`).toBe('ILLEGAL_STATE_TRANSITION');
      }
    }
  });

  it('NO_SHOW before ARRIVED is refused; after ARRIVED it is allowed; ARRIVED records the time', () => {
    const b = Booking.fromRecord(bookingRec({ status: 'CONFIRMED' }));
    expect(code(() => b.updatePickupStatus('NO_SHOW', NOW))).toBe('ILLEGAL_STATE_TRANSITION');
    b.updatePickupStatus('APPROACHING', NOW);
    b.updatePickupStatus('ARRIVED', NOW);
    expect(b.toRecord().arrivedAt).toEqual(NOW);
    b.updatePickupStatus('NO_SHOW', NOW);
    expect(b.isSettled()).toBe(true);
  });

  it('a pending booking has no pickup status yet', () => {
    expect(code(() => Booking.fromRecord(bookingRec()).updatePickupStatus('APPROACHING', NOW))).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('cancel is refused once the rider has been picked up', () => {
    expect(code(() => Booking.fromRecord(bookingRec({ status: 'CONFIRMED', pickupStatus: 'PICKED_UP' })).cancel())).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('confirm holds an amount; cancel clears it', () => {
    const b = Booking.fromRecord(bookingRec());
    b.confirm(NOW, 300, 'HELD');
    expect(b.toRecord()).toMatchObject({ status: 'CONFIRMED', heldCents: 300, paymentStatus: 'HELD', confirmedAt: NOW });
    b.cancel();
    expect(b.toRecord().heldCents).toBe(0);
  });

  it('markUnpaid only after DROPPED_OFF; isSettled is true for DROPPED_OFF, NO_SHOW, UNPAID and CANCELLED', () => {
    const b = Booking.fromRecord(bookingRec({ status: 'CONFIRMED', pickupStatus: 'PICKED_UP' }));
    expect(code(() => b.markUnpaid())).toBe('ILLEGAL_STATE_TRANSITION');
    expect(b.isSettled()).toBe(false);
    b.updatePickupStatus('DROPPED_OFF', NOW);
    expect(b.isSettled()).toBe(true);
    b.markUnpaid();
    expect(b.toRecord()).toMatchObject({ pickupStatus: 'UNPAID', paymentStatus: 'UNPAID' });
    expect(Booking.fromRecord(bookingRec({ status: 'CANCELLED' })).isSettled()).toBe(true);
  });

  it('complete records the final fare; markPaid frees the hold', () => {
    const b = Booking.fromRecord(bookingRec({ status: 'CONFIRMED', heldCents: 300 }));
    b.complete(200);
    b.markPaid();
    expect(b.toRecord()).toMatchObject({ status: 'COMPLETED', finalFareCents: 200, paymentStatus: 'PAID', heldCents: 0 });
  });
});

describe('F7b: HopRequest, Route, FareTier, MatchResultSet', () => {
  const hop = () =>
    HopRequest.fromRecord({
      id: 'h1',
      passengerId: 'u1',
      fromLocationId: 'a',
      toLocationId: 'b',
      requestedTime: NOW,
      status: 'OPEN',
      expiresAt: new Date(NOW.getTime() + 1800_000),
    });

  it('an open request can be resolved or expired once', () => {
    const r = hop();
    expect(r.isOpen()).toBe(true);
    r.resolve();
    expect(r.status).toBe('MATCHED');
    expect(code(() => r.resolve())).toBe('ILLEGAL_STATE_TRANSITION');
    expect(code(() => r.expire())).toBe('ILLEGAL_STATE_TRANSITION');
    const e = hop();
    e.expire();
    expect(e.status).toBe('EXPIRED');
  });

  it('isStillWanted is true only while open and before the expiry', () => {
    const r = hop();
    expect(r.isStillWanted(new Date(NOW.getTime() + 1800_000))).toBe(true);
    expect(r.isStillWanted(new Date(NOW.getTime() + 1800_001))).toBe(false);
  });

  it('Route measures the distance from a point to its polyline', () => {
    const r = Route.fromRecord({
      polyline: '',
      points: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.01 },
      ],
      durationSec: 120,
      distanceM: 1112,
    });
    expect(r.distanceFrom({ lat: 0.0009, lng: 0.005 })).toBeGreaterThan(99);
    expect(r.durationSec).toBe(120);
  });

  it('FareTier: 1 rider $3.00, 2 or 3 riders $2.00 each; 0 and 4 are refused (FR 5.1)', () => {
    expect([1, 2, 3].map(FareTier.calculateFare)).toEqual([300, 200, 200]);
    expect(code(() => FareTier.calculateFare(0))).toBe('VALIDATION_ERROR');
    expect(code(() => FareTier.calculateFare(4))).toBe('VALIDATION_ERROR');
    expect(code(() => FareTier.calculateFare(1.5))).toBe('VALIDATION_ERROR');
  });

  it('MatchResultSet ranks with a strategy, keeps the order of ties, and returns the top n', () => {
    const c = (id: string, walk: number): MatchCandidate => ({
      journeyId: id,
      driverId: 'd',
      driverName: 'D',
      driverAvgRating: null,
      driverUnpaidCount: 0,
      pickupPointId: 'p',
      walkDistanceM: walk,
      detourMin: 1,
      pickupTime: NOW,
      fareCents: 300,
    });
    const set = new MatchResultSet([c('a', 300), c('b', 100), c('c', 100), c('d', 200)]);
    const ranked = set.rank({ compare: (x, y) => x.walkDistanceM - y.walkDistanceM });
    expect(ranked.all().map((x) => x.journeyId)).toEqual(['b', 'c', 'd', 'a']);
    expect(ranked.top(2).map((x) => x.journeyId)).toEqual(['b', 'c']);
    expect(ranked.top(0)).toEqual([]);
    expect(set.size).toBe(4);
  });
});

// ------------------------------------------------------------------------------------------------ F7c
describe('F7c: Wallet', () => {
  const wallet = (balanceCents = 1000, heldCents = 0) => Wallet.fromRecord({ userId: 'u1', balanceCents, heldCents });

  it('hold reserves money; above the available amount is INSUFFICIENT_BALANCE', () => {
    const w = wallet(500, 100);
    expect(w.available.cents).toBe(400);
    w.hold(Money.cents(400));
    expect(w.heldMoney.cents).toBe(500);
    expect(code(() => w.hold(Money.cents(1)))).toBe('INSUFFICIENT_BALANCE');
  });

  it('hasSufficientBalance is exact at the boundary', () => {
    const w = wallet(300, 0);
    expect(w.hasSufficientBalance(Money.cents(300))).toBe(true);
    expect(w.hasSufficientBalance(Money.cents(301))).toBe(false);
  });

  it('release returns a hold; releasing more than held is our bug (a plain Error)', () => {
    const w = wallet(500, 200);
    w.release(Money.cents(200));
    expect(w.heldMoney.cents).toBe(0);
    expect(() => w.release(Money.cents(1))).toThrow('Cannot release more than is held');
  });

  it('deduct takes a held amount for good; deducting more than held is our bug', () => {
    const w = wallet(500, 300);
    w.deduct(Money.cents(300));
    expect(w.toRecord()).toMatchObject({ balanceCents: 200, heldCents: 0 });
    expect(() => w.deduct(Money.cents(1))).toThrow('Cannot deduct more than is held');
  });

  it('credit adds to the balance; topUp stops at $100 (NFR-6.5)', () => {
    const w = wallet(9_900, 0);
    w.credit(Money.cents(100));
    expect(w.balanceMoney.cents).toBe(10_000);
    expect(code(() => w.topUp(Money.cents(1)))).toBe('VALIDATION_ERROR');
    const v = wallet(0, 0);
    v.topUp(Money.cents(10_000));
    expect(v.balanceMoney.cents).toBe(10_000);
  });

  it('withdraw only takes what is available', () => {
    const w = wallet(500, 300);
    expect(code(() => w.withdraw(Money.cents(201)))).toBe('INSUFFICIENT_BALANCE');
    w.withdraw(Money.cents(200));
    expect(w.balanceMoney.cents).toBe(300);
  });

  it('refuses to be built with more held than balance', () => {
    expect(() => wallet(100, 200)).toThrow(RangeError);
  });

  it('property: any sequence of valid operations keeps balance >= 0 and held <= balance', () => {
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let run = 0; run < 200; run++) {
      const w = wallet(rand(2000), 0);
      for (let step = 0; step < 60; step++) {
        const amount = Money.cents(rand(500));
        const op = rand(5);
        try {
          if (op === 0) w.hold(amount);
          else if (op === 1) w.release(amount);
          else if (op === 2) w.deduct(amount);
          else if (op === 3) w.credit(amount);
          else w.withdraw(amount);
        } catch {
          /* a refused operation must leave the wallet unchanged and valid */
        }
        const r = w.toRecord();
        expect(r.balanceCents).toBeGreaterThanOrEqual(0);
        expect(r.heldCents).toBeGreaterThanOrEqual(0);
        expect(r.heldCents).toBeLessThanOrEqual(r.balanceCents);
      }
    }
  });
});

describe('F7c: append-only records, Debt, Rating, Notification, location', () => {
  it('WalletTransaction and LocationUpdate are frozen: no mutators', () => {
    const t = new WalletTransaction('t1', 'u1', 'TOP_UP', 500, null, NOW);
    expect(Object.isFrozen(t)).toBe(true);
    expect(() => ((t as unknown as { amount: Money }).amount = Money.zero())).toThrow();
    expect(t.amount.cents).toBe(500);
    const l = new LocationUpdate('j1', 1.3, 103.6, 12, NOW);
    expect(Object.isFrozen(l)).toBe(true);
  });

  it('LocationUpdate: low accuracy is worse than 50 m; age is in whole seconds', () => {
    expect(new LocationUpdate('j', 0, 0, 50, NOW).isLowAccuracy()).toBe(false);
    expect(new LocationUpdate('j', 0, 0, 51, NOW).isLowAccuracy()).toBe(true);
    expect(new LocationUpdate('j', 0, 0, 5, NOW).ageSeconds(new Date(NOW.getTime() + 15_400))).toBe(15);
  });

  it('Debt: outstanding until cleared; a fine adds to it; a cleared debt cannot change', () => {
    const d = Debt.fromRecord({ id: 'd1', userId: 'u1', bookingId: 'b1', amountCents: 100, createdAt: NOW, clearedAt: null });
    expect(d.isOutstanding()).toBe(true);
    d.applyFine(50);
    expect(d.amountCents).toBe(150);
    expect(() => d.applyFine(0)).toThrow(RangeError);
    d.clear(NOW);
    expect(d.isOutstanding()).toBe(false);
    expect(code(() => d.clear(NOW))).toBe('ILLEGAL_STATE_TRANSITION');
    expect(code(() => d.applyFine(10))).toBe('ILLEGAL_STATE_TRANSITION');
  });

  it('Rating: 0 and 6 stars fail, 1 and 5 pass; a 201-character comment fails; you cannot rate yourself', () => {
    const r = (stars: number, comment: string | null = null, ratee = 'u2') => new Rating('b1', 'u1', ratee, stars, comment);
    expect(code(() => r(0).validate())).toBe('VALIDATION_ERROR');
    expect(code(() => r(6).validate())).toBe('VALIDATION_ERROR');
    expect(code(() => r(2.5).validate())).toBe('VALIDATION_ERROR');
    expect(code(() => r(1).validate())).toBeUndefined();
    expect(code(() => r(5, 'x'.repeat(200)).validate())).toBeUndefined();
    expect(code(() => r(5, 'x'.repeat(201)).validate())).toBe('VALIDATION_ERROR');
    expect(code(() => r(5, null, 'u1').validate())).toBe('VALIDATION_ERROR');
  });

  it('Notification.markRead', () => {
    const n = Notification.fromRecord({ id: 'n1', userId: 'u1', type: 'TRIP_STARTED', message: 'm', link: null, isRead: false, timestamp: NOW });
    n.markRead();
    expect(n.isRead).toBe(true);
  });

  it('CampusLocation.distanceTo is the straight-line distance in metres', () => {
    const a = new CampusLocation('a', 'A', 'HALLS', false, { lat: 0, lng: 0 });
    const b = new CampusLocation('b', 'B', 'GATE', true, { lat: 0, lng: 0.01 });
    expect(a.distanceTo(b)).toBeGreaterThan(1100);
    expect(a.distanceTo(b)).toBeLessThan(1120);
  });
});
