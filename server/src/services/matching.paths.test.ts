/**
 * Task Q2, method 2 (Lab 4 white-box, basis-path testing): the match filter chain, `fitJourney` (with `bestPickup` inside it).
 * FR 4.2, 4.7, 4.9 (the free-seat and not-LOCKED filters are database conditions of the query, tested in matching.int.test.ts).
 *
 * Decision nodes of fitJourney + bestPickup:
 *   D1 route has no points?      D2 destination off the driver's way?     D3 is there another pickup point to look at? (loop)
 *   D4 type not allowed?         D5 walk over 400 m?                       D6 detour over the tolerance?
 *   D7 nothing chosen yet?       D8 detour smaller than the best so far?   D9 detour equal to the best so far?   D10 walk shorter?
 * Ten decision nodes, so V(G) = 10 + 1 = 11 independent paths. Node numbers per path are in docs/tests/basis-path.md.
 *
 * Geometry: the route runs north along longitude 103.0 from latitude 1.0 to 1.006. A point `m` metres east of the route is
 * 2m / (20 km/h) minutes of detour away: 100 m = 0.6 min, 400 m = 2.4 min, 833 m = 5.0 min, 850 m = 5.1 min, 900 m = 5.4 min.
 */
import { describe, expect, it } from 'vitest';
import { fitJourney, type PickupOption } from './matching';

const route = [
  { lat: 1.0, lng: 103.0 },
  { lat: 1.006, lng: 103.0 },
];
const east = (metres: number) => ({ lat: 1.003, lng: 103.0 + metres / 111_195 });
const stop = (id: string, metres: number, walk = 100, type: 'BUS_STOP' | 'CARPARK' = 'BUS_STOP'): PickupOption => ({
  id,
  type,
  walkDistanceM: walk,
  position: east(metres),
});
const fit = (o: Partial<Parameters<typeof fitJourney>[0]> = {}) =>
  fitJourney({ route, allowed: ['BUS_STOP', 'CARPARK'], toleranceMin: 5, destination: east(0), pickups: [stop('a', 100)], ...o });

describe('Q2 method 2: fitJourney, V(G) = 11', () => {
  it('P1 (D1 true): a journey with no stored route points does not fit', () => {
    expect(fit({ route: [] })).toBeNull();
  });

  it('P2 (D1 false, D2 true): a destination 900 m off the route (5.4 min) is not on the way', () => {
    expect(fit({ destination: east(900) })).toBeNull();
  });

  it('P3 (D3 false at once): a place with no pickup points gives no match', () => {
    expect(fit({ pickups: [] })).toBeNull();
  });

  it('P4 (D4 true): the only pickup point is a type the driver does not allow', () => {
    expect(fit({ pickups: [stop('a', 100, 100, 'CARPARK')], allowed: ['BUS_STOP'] })).toBeNull();
  });

  it('P5 (D4 false, D5 true): the only pickup point is 401 m from the rider on foot', () => {
    expect(fit({ pickups: [stop('a', 100, 401)] })).toBeNull();
  });

  it('P6 (D5 false, D6 true): the only pickup point costs 5.4 minutes of detour', () => {
    expect(fit({ pickups: [stop('a', 900)] })).toBeNull();
  });

  it('P7 (D6 false, D7 true): the first acceptable point becomes the choice', () => {
    expect(fit({ pickups: [stop('a', 100)] })?.point.id).toBe('a');
  });

  it('P8 (D7 false, D8 true): a later point with less detour replaces it', () => {
    expect(fit({ pickups: [stop('far', 400), stop('near', 100)] })?.point.id).toBe('near');
  });

  it('P9 (D7 false, D8 false, D9 false): a later point with more detour does not replace it', () => {
    expect(fit({ pickups: [stop('near', 100), stop('far', 400)] })?.point.id).toBe('near');
  });

  it('P10 (D9 true, D10 true): the same detour but a shorter walk replaces it', () => {
    expect(fit({ pickups: [stop('long-walk', 100, 300), stop('short-walk', 100, 50)] })?.point.id).toBe('short-walk');
  });

  it('P11 (D9 true, D10 false): the same detour and a longer walk does not replace it', () => {
    expect(fit({ pickups: [stop('short-walk', 100, 50), stop('long-walk', 100, 300)] })?.point.id).toBe('short-walk');
  });

  it('boundaries inside D6: a detour of exactly 5.0 minutes is accepted, 5.1 is not (rounded to 0.1)', () => {
    const exactly5 = 833.3; // 2 x 833.3 m at 20 km/h = 5.0 min
    expect(fit({ pickups: [stop('a', exactly5)] })).not.toBeNull();
    expect(fit({ pickups: [stop('a', 850)] })).toBeNull(); // 5.1 min
  });

  it('boundaries inside D5: 400 m on foot is accepted, 401 m is not', () => {
    expect(fit({ pickups: [stop('a', 100, 400)] })).not.toBeNull();
    expect(fit({ pickups: [stop('a', 100, 401)] })).toBeNull();
  });
});
