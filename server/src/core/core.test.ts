import { describe, expect, it } from 'vitest';
import { FakeClock, SystemClock, addMs, minutes, seconds, sgDate } from './clock';
import { Money } from './money';
import { detourMinutes, distanceToPolygonEdgeM, distanceToPolylineM, distanceToSegmentM, haversineM, pointInPolygon } from './geo';

describe('K3: Clock', () => {
  it('FakeClock starts fixed and only moves when told to', () => {
    const c = new FakeClock('2026-10-19T08:00:00.000Z');
    expect(c.now().toISOString()).toBe('2026-10-19T08:00:00.000Z');
    c.advance(minutes(3) + seconds(30));
    expect(c.now().toISOString()).toBe('2026-10-19T08:03:30.000Z');
    c.set('2026-10-20T00:00:00.000Z');
    expect(c.now().toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('now() returns a copy, so a caller cannot move the clock by mutating it', () => {
    const c = new FakeClock();
    c.now().setFullYear(1999);
    expect(c.now().getUTCFullYear()).toBe(2026);
  });

  it('SystemClock is close to the real time', () => {
    expect(Math.abs(new SystemClock().now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('addMs adds without changing its input', () => {
    const d = new Date('2026-10-19T08:00:00.000Z');
    expect(addMs(d, 1000).toISOString()).toBe('2026-10-19T08:00:01.000Z');
    expect(d.toISOString()).toBe('2026-10-19T08:00:00.000Z');
  });

  it('sgDate flips at midnight Singapore time (16:00 UTC), not at midnight UTC', () => {
    expect(sgDate(new Date('2026-10-19T15:59:59.999Z'))).toBe('2026-10-19');
    expect(sgDate(new Date('2026-10-19T16:00:00.000Z'))).toBe('2026-10-20');
    expect(sgDate(new Date('2026-10-19T00:00:00.000Z'))).toBe('2026-10-19');
  });
});

describe('K3: Money', () => {
  it('works in whole cents and formats as dollars', () => {
    expect(Money.cents(300).format()).toBe('$3.00');
    expect(Money.cents(5).format()).toBe('$0.05');
    expect(Money.cents(100_000).format()).toBe('$1000.00');
  });

  it('refuses a fraction, a negative amount and NaN', () => {
    expect(() => Money.cents(2.5)).toThrow(RangeError);
    expect(() => Money.cents(-1)).toThrow(RangeError);
    expect(() => Money.cents(Number.NaN)).toThrow(RangeError);
  });

  it('fromDollars never goes through float multiplication', () => {
    expect(Money.fromDollars('3').cents).toBe(300);
    expect(Money.fromDollars('3.5').cents).toBe(350);
    expect(Money.fromDollars('0.07').cents).toBe(7);
    expect(Money.fromDollars(19.99).cents).toBe(1999);
    expect(() => Money.fromDollars('1.234')).toThrow(RangeError);
    expect(() => Money.fromDollars('abc')).toThrow(RangeError);
  });

  it('add, sub and comparisons; sub below zero throws', () => {
    const a = Money.cents(300);
    const b = Money.cents(200);
    expect(a.add(b).cents).toBe(500);
    expect(a.sub(b).cents).toBe(100);
    expect(() => b.sub(a)).toThrow(RangeError);
    expect(a.gt(b) && a.gte(a) && b.lt(a) && b.lte(b) && a.equals(Money.cents(300))).toBe(true);
    expect(Money.min(a, b).cents).toBe(200);
    expect(Money.zero().isZero()).toBe(true);
  });

  it('mulFraction rounds down with integers only: 75% of 299 cents is 224', () => {
    expect(Money.cents(299).mulFraction(75, 100).cents).toBe(224);
    expect(Money.cents(300).mulFraction(3, 4).cents).toBe(225);
    expect(() => Money.cents(1).mulFraction(1, 0)).toThrow(RangeError);
  });

  it('serialises as plain cents', () => {
    expect(JSON.stringify({ fare: Money.cents(200) })).toBe('{"fare":200}');
  });
});

describe('geometry', () => {
  const a = { lat: 1.3483, lng: 103.6831 };

  it('haversine: one degree of latitude is about 111 km', () => {
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(111_000);
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(111_400);
    expect(haversineM(a, a)).toBe(0);
  });

  it('distance to a segment: perpendicular, beyond the end, and a zero-length segment', () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 0, lng: 0.01 }; // about 1112 m east
    const above = { lat: 0.0009, lng: 0.005 }; // about 100 m north of the middle
    expect(distanceToSegmentM(above, p1, p2)).toBeGreaterThan(99);
    expect(distanceToSegmentM(above, p1, p2)).toBeLessThan(101);
    const beyond = { lat: 0, lng: 0.011 };
    expect(distanceToSegmentM(beyond, p1, p2)).toBeCloseTo(haversineM(beyond, p2), 0);
    expect(distanceToSegmentM(above, p1, p1)).toBeCloseTo(haversineM(above, p1), 0);
  });

  it('distance to a polyline picks the nearest segment', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      { lat: 0.01, lng: 0.01 },
    ];
    expect(distanceToPolylineM({ lat: 0.005, lng: 0.0101 }, line)).toBeLessThan(12);
    expect(() => distanceToPolylineM(a, [])).toThrow(RangeError);
    expect(distanceToPolylineM({ lat: 0, lng: 0.001 }, [{ lat: 0, lng: 0 }])).toBeGreaterThan(100);
  });

  it('point in polygon and distance to its edge', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      { lat: 0.01, lng: 0.01 },
      { lat: 0.01, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 0.005, lng: 0.005 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 0.02, lng: 0.005 }, square)).toBe(false);
    expect(distanceToPolygonEdgeM({ lat: 0.005, lng: 0.011 }, square)).toBeGreaterThan(100);
    expect(distanceToPolygonEdgeM({ lat: 0.005, lng: 0.011 }, square)).toBeLessThan(115);
  });

  it('detour: 200 m out and back at 20 km/h is 1.2 minutes', () => {
    expect(detourMinutes(200, 20)).toBeCloseTo(1.2, 5);
    expect(detourMinutes(0, 20)).toBe(0);
  });
});
