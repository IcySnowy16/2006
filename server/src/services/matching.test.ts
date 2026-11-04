/**
 * Tasks B5b and C4, the pure parts (no database): the filter helpers, the detour estimate, the ranking Strategy and the trust rule.
 * Lab 4 Q2 boundary cases live here: detour exactly 5 passes, 5.1 fails; 75% of the fare passes, one cent less fails.
 */
import { describe, expect, it } from 'vitest';
import { MatchResultSet, type MatchCandidate } from '../entities/MatchResultSet';
import { bestPickup, detourAllowed, detourFor, progressAlong, ScoreRanking, SoonestFirst, withinTimeWindow } from './matching';
import { trustDecision } from './trust';

const route = [
  { lat: 1.0, lng: 103.0 },
  { lat: 1.006, lng: 103.0 },
];
// 1 degree of latitude is 111.19 km here, so 0.0001 degree is about 11.1 m.
const east = (metres: number) => ({ lat: 1.003, lng: 103.0 + metres / 111_195 });

describe('detour estimate (13 Oct decision: twice the distance to the stored route, at 20 km/h)', () => {
  it('a point on the route costs 0 minutes', () => {
    expect(detourFor({ lat: 1.003, lng: 103.0 }, route)).toBe(0);
  });

  it('1.0 km off the route at 20 km/h is 6 minutes, which is over the limit of 5', () => {
    const d = detourFor(east(1000), route);
    expect(d).toBeCloseTo(6, 1);
    expect(detourAllowed(d, 5)).toBe(false);
  });

  it('exactly 5.0 minutes passes and 5.1 fails; a tolerance above 5 never lets more than 5 through', () => {
    expect(detourAllowed(5, 5)).toBe(true);
    expect(detourAllowed(5.1, 5)).toBe(false);
    expect(detourAllowed(5.1, 8)).toBe(false);
    expect(detourAllowed(2, 1)).toBe(false);
  });

  it('a route with no points cannot be matched', () => {
    expect(detourFor({ lat: 1, lng: 103 }, [])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('time window (SRS Q8 default: 15 minutes either side)', () => {
  const at = new Date('2026-10-19T08:00:00Z');
  it('14:59 and 15:00 inside, 15:01 outside, in both directions', () => {
    for (const sign of [1, -1]) {
      expect(withinTimeWindow(at, new Date(at.getTime() + sign * (15 * 60_000 - 1000)))).toBe(true);
      expect(withinTimeWindow(at, new Date(at.getTime() + sign * 15 * 60_000))).toBe(true);
      expect(withinTimeWindow(at, new Date(at.getTime() + sign * (15 * 60_000 + 1000)))).toBe(false);
    }
  });
});

describe('bestPickup', () => {
  const pts = [
    { id: 'bus-far', type: 'BUS_STOP' as const, walkDistanceM: 100, position: east(400) },
    { id: 'bus-near', type: 'BUS_STOP' as const, walkDistanceM: 150, position: east(100) },
    { id: 'park', type: 'CARPARK' as const, walkDistanceM: 50, position: east(100) },
  ];

  it('takes the allowed point with the least detour, then the shorter walk', () => {
    expect(bestPickup(pts, route, ['BUS_STOP', 'CARPARK'], 5)?.point.id).toBe('park'); // same detour as bus-near, shorter walk
    expect(bestPickup(pts, route, ['BUS_STOP'], 5)?.point.id).toBe('bus-near');
  });

  it('rejects a type that is not allowed, a walk over 400 m and a detour over the tolerance', () => {
    expect(bestPickup(pts, route, [], 5)).toBeNull();
    expect(bestPickup([{ ...pts[1]!, walkDistanceM: 401 }], route, ['BUS_STOP'], 5)).toBeNull();
    expect(bestPickup(pts, route, ['BUS_STOP'], 0)).toBeNull();
  });
});

describe('progressAlong', () => {
  it('0 at the start, about 1 at the end, between for a point in the middle', () => {
    expect(progressAlong(route, { lat: 1.0, lng: 103.0 })).toBe(0);
    expect(progressAlong(route, { lat: 1.006, lng: 103.0 })).toBe(1);
    expect(progressAlong([...route, { lat: 1.012, lng: 103.0 }], { lat: 1.006, lng: 103.0 })).toBeCloseTo(0.5, 2);
    expect(progressAlong([route[0]!], route[0]!)).toBe(0);
  });
});

describe('ranking Strategy (FR 4.5): deterministic, and swappable', () => {
  const base: MatchCandidate = {
    journeyId: 'a',
    driverId: 'd',
    driverName: 'D',
    driverAvgRating: 4,
    driverUnpaidCount: 0,
    pickupPointId: 'p',
    walkDistanceM: 100,
    detourMin: 2,
    pickupTime: new Date('2026-10-19T08:10:00Z'),
    fareCents: 300,
  };
  const make = (o: Partial<MatchCandidate>) => ({ ...base, ...o });
  const set = new MatchResultSet([
    make({ journeyId: 'slow-clean', detourMin: 1, pickupTime: new Date('2026-10-19T08:14:00Z') }),
    make({ journeyId: 'fast-detour', detourMin: 4, pickupTime: new Date('2026-10-19T08:05:00Z') }),
    make({ journeyId: 'unpaid', detourMin: 1, driverUnpaidCount: 1, pickupTime: new Date('2026-10-19T08:07:00Z') }),
  ]);

  it('default score: small detour wins, unpaid history costs', () => {
    expect(
      set
        .rank(new ScoreRanking())
        .all()
        .map((c) => c.journeyId),
    ).toEqual(['slow-clean', 'unpaid', 'fast-detour']);
  });

  it('the same input always gives the same order', () => {
    const a = set
      .rank(new ScoreRanking())
      .all()
      .map((c) => c.journeyId);
    const b = set
      .rank(new ScoreRanking())
      .all()
      .map((c) => c.journeyId);
    expect(a).toEqual(b);
  });

  it('swapping the Strategy changes the order', () => {
    expect(
      set
        .rank(new SoonestFirst())
        .all()
        .map((c) => c.journeyId),
    ).toEqual(['fast-detour', 'unpaid', 'slow-clean']);
  });

  it('an unrated driver counts as 3.5 stars, between a bad and a good rating', () => {
    const s = new ScoreRanking();
    const score = (r: number | null) => s.score(make({ driverAvgRating: r }));
    expect(score(5)).toBeLessThan(score(null));
    expect(score(null)).toBeLessThan(score(2));
  });
});

describe('C4 trustDecision: ENOUGH / NOT_ENOUGH, and ON_TRUST when the bookOnTrust flag is on (FR 10.2 to 10.4)', () => {
  it('enough money -> ENOUGH, whatever the history or the flag', () => {
    for (const trust of [true, false]) {
      expect(trustDecision(300, 0, 300, trust)).toBe('ENOUGH');
      expect(trustDecision(10_000, 0, 300, trust)).toBe('ENOUGH');
    }
  });

  it('flag OFF (the current setting): anything short of the whole fare is NOT_ENOUGH, even 75% with many rides', () => {
    expect(trustDecision(299, 0, 300, false)).toBe('NOT_ENOUGH');
    expect(trustDecision(225, 3, 300, false)).toBe('NOT_ENOUGH');
    expect(trustDecision(225, 50, 300, false)).toBe('NOT_ENOUGH');
    expect(trustDecision(150, 3, 200, false)).toBe('NOT_ENOUGH');
  });

  it('flag ON: 75% exactly with 3 completed rides -> ON_TRUST; one cent less -> NOT_ENOUGH', () => {
    expect(trustDecision(225, 3, 300, true)).toBe('ON_TRUST');
    expect(trustDecision(224, 3, 300, true)).toBe('NOT_ENOUGH');
    expect(trustDecision(150, 3, 200, true)).toBe('ON_TRUST');
    expect(trustDecision(149, 3, 200, true)).toBe('NOT_ENOUGH');
  });

  it('flag ON: 3 completed rides pass, 2 fail', () => {
    expect(trustDecision(225, 2, 300, true)).toBe('NOT_ENOUGH');
    expect(trustDecision(225, 3, 300, true)).toBe('ON_TRUST');
    expect(trustDecision(225, 50, 300, true)).toBe('ON_TRUST');
  });

  it('an empty wallet is NOT_ENOUGH however many rides', () => {
    expect(trustDecision(0, 100, 300, true)).toBe('NOT_ENOUGH');
    expect(trustDecision(0, 100, 300, false)).toBe('NOT_ENOUGH');
  });
});
