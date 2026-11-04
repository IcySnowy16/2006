/**
 * Task B5b: the pure parts of matching, with no database and no Maps call, so the filter chain and the ranking can be tested
 * by plain examples (Lab 4 Q2, the basis-path test).
 *
 * The filter chain (FR 4.2 to 4.9, UC-8): same time window -> pickup point of an allowed type -> within walking distance ->
 * added detour within the driver's tolerance and never over 5 minutes -> free seats -> passenger not LOCKED. The service applies
 * the database-backed steps (time window, seats, locked) in its queries and these functions for the rest.
 *
 * Detour (13 Oct decision): twice the shortest distance from the pickup point to the driver's STORED route, at an average speed
 * (DEFAULTS.AVG_SPEED_KMH). It is an estimate, which is enough on a campus. Rounded to 0.1 minute so "exactly 5" is stable.
 */
import { DEFAULTS, type PickupType } from '@campus-hop/shared';
import { MAX_DETOUR_TOLERANCE_MIN } from '../entities/DriverPreset';
import type { MatchCandidate, RankingStrategy } from '../entities/MatchResultSet';
import { detourMinutes, distanceToPolylineM, haversineM, type LatLng } from '../core/geo';
import { minutes } from '../core/clock';

/** Weights of the default ranking (FR 4.5). Lower score is better. */
export const RANKING_WEIGHTS = {
  perDetourMin: 10,
  perWalk100m: 3,
  /** Points added per star below 5; an unrated driver counts as 3.5 stars. */
  perMissingStar: 4,
  perUnpaid: 15,
} as const;

export function detourFor(point: LatLng, route: readonly LatLng[], speedKmh: number = DEFAULTS.AVG_SPEED_KMH): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  return Math.round(detourMinutes(distanceToPolylineM(point, route), speedKmh) * 10) / 10;
}

/** The driver's tolerance, never above 5 minutes whatever was saved (FR 4.2, 3.1.4). */
export const detourAllowed = (detourMin: number, toleranceMin: number): boolean => detourMin <= Math.min(toleranceMin, MAX_DETOUR_TOLERANCE_MIN);

/** FR 4.1: the journey leaves within the matching tolerance (SRS Q8 default: 15 minutes either side) of the requested time. */
export function withinTimeWindow(requested: Date, departure: Date): boolean {
  return Math.abs(departure.getTime() - requested.getTime()) <= minutes(DEFAULTS.MATCH_TIME_TOLERANCE_MIN);
}

export interface PickupOption {
  id: string;
  type: PickupType;
  walkDistanceM: number;
  position: LatLng;
}

export interface PickupChoice {
  point: PickupOption;
  detourMin: number;
}

/**
 * The best pickup point of a place for one route: of the allowed type (FR 4.7), within walking distance, inside the detour
 * tolerance. Least detour wins, then least walking. null when no point passes.
 */
export function bestPickup(
  points: readonly PickupOption[],
  route: readonly LatLng[],
  allowed: readonly PickupType[],
  toleranceMin: number,
): PickupChoice | null {
  let best: PickupChoice | null = null;
  for (const point of points) {
    if (!allowed.includes(point.type)) continue;
    if (point.walkDistanceM > DEFAULTS.MAX_WALK_M) continue;
    const detourMin = detourFor(point.position, route);
    if (!detourAllowed(detourMin, toleranceMin)) continue;
    if (!best || detourMin < best.detourMin || (detourMin === best.detourMin && point.walkDistanceM < best.point.walkDistanceM)) best = { point, detourMin };
  }
  return best;
}

/**
 * The route-dependent part of the filter chain for ONE journey (FR 4.2, 4.7): the route must exist, the rider's destination must be on
 * the driver's way, and some pickup point of the right type must be within walking distance and detour tolerance. Pure, so every path
 * through it is tested (Lab 4 basis paths, task Q2). null means "this journey does not fit".
 */
export function fitJourney(input: {
  route: readonly LatLng[];
  allowed: readonly PickupType[];
  toleranceMin: number;
  destination: LatLng;
  pickups: readonly PickupOption[];
}): PickupChoice | null {
  if (input.route.length === 0) return null;
  if (!detourAllowed(detourFor(input.destination, input.route), input.toleranceMin)) return null;
  return bestPickup(input.pickups, input.route, input.allowed, input.toleranceMin);
}

/** Share (0 to 1) of the route's length that comes before the point nearest to `p`; used to estimate the pickup time. */
export function progressAlong(route: readonly LatLng[], p: LatLng): number {
  if (route.length < 2) return 0;
  let total = 0;
  const cumulative = [0];
  for (let i = 1; i < route.length; i++) {
    total += haversineM(route[i - 1]!, route[i]!);
    cumulative.push(total);
  }
  if (total === 0) return 0;
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  route.forEach((v, i) => {
    const d = haversineM(v, p);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  return cumulative[nearest]! / total;
}

/** The default Strategy: detour and walking cost points, a good rating and a clean payment history save them. */
export class ScoreRanking implements RankingStrategy {
  score(c: MatchCandidate): number {
    const stars = c.driverAvgRating ?? 3.5;
    return (
      c.detourMin * RANKING_WEIGHTS.perDetourMin +
      (c.walkDistanceM / 100) * RANKING_WEIGHTS.perWalk100m +
      (5 - stars) * RANKING_WEIGHTS.perMissingStar +
      c.driverUnpaidCount * RANKING_WEIGHTS.perUnpaid
    );
  }

  compare(a: MatchCandidate, b: MatchCandidate): number {
    return this.score(a) - this.score(b) || a.pickupTime.getTime() - b.pickupTime.getTime() || a.journeyId.localeCompare(b.journeyId);
  }
}

/** An alternative Strategy, here to show the ranking can be swapped (and tested): the soonest pickup first. */
export class SoonestFirst implements RankingStrategy {
  compare(a: MatchCandidate, b: MatchCandidate): number {
    return a.pickupTime.getTime() - b.pickupTime.getTime() || a.journeyId.localeCompare(b.journeyId);
  }
}

/**
 * FR 4.11 (flag `reorderPickups`, Tier 3): order stops along the driver's route, nearest the start first, which is the order that
 * minimises the total detour on a straight-ish campus route. Items keep their order when they are at the same place.
 */
export function orderAlongRoute<T>(items: readonly T[], route: readonly LatLng[], positionOf: (item: T) => LatLng): T[] {
  return items
    .map((item, index) => ({ item, index, progress: progressAlong(route, positionOf(item)) }))
    .sort((a, b) => a.progress - b.progress || a.index - b.index)
    .map((x) => x.item);
}
