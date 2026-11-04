/**
 * Task B5b: Find Matches (UC-8), both directions, one filter chain.
 *
 *   passenger first  findJourneysFor(request)   open journeys that fit one request, ranked
 *   driver first     findRequestsFor(journeyId) open requests that fit one journey (the request cards, FR 4.8)
 *
 * Matching uses stored data and distance maths only. It never calls Maps (13 Oct decision): the detour is measured against the
 * route saved at go-live. A journey with no stored route is not matchable. Walking distance is the stored PickupPoint.walkDistanceM.
 * The ranking is a Strategy (MatchResultSet.rank), so it can be swapped.
 */
import type { Prisma } from '@prisma/client';
import { DEFAULTS, type Hop, type PickupType } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { addMs, minutes } from '../core/clock';
import type { LatLng } from '../core/geo';
import { FareTier } from '../entities/FareTier';
import { Journey, type JourneyRecord } from '../entities/Journey';
import { MatchResultSet, type MatchCandidate, type RankingStrategy } from '../entities/MatchResultSet';
import { User, type UserRecord } from '../entities/User';
import { AppError } from '../errors/AppError';
import { assertOwner } from '../middleware/ownership';
import { detourFor, fitJourney, progressAlong, ScoreRanking, withinTimeWindow, type PickupChoice, type PickupOption } from './matching';
import { toPickupPoint } from './mappers';
import { storedPoints } from './RouteService';

type Match = z.infer<typeof Hop.Match>;
type RequestCard = z.infer<typeof Hop.RequestCard>;

const ALL_TYPES: PickupType[] = ['BUS_STOP', 'CARPARK'];
/** Candidates examined per query: matching must answer inside 3 seconds (NFR-1.1) and a campus has few live journeys. */
const CANDIDATE_CAP = 100;

type PlaceWithPoints = Prisma.CampusLocationGetPayload<{ include: { pickupPoints: true } }>;
type JourneyForMatching = Prisma.JourneyGetPayload<{ include: { route: true; preset: true; driver: true } }>;

export interface RequestMatch {
  hopRequestId: string;
  passengerId: string;
  passenger: { id: string; firstName: string; avgRating: number | null; unpaidCount: number };
  pickup: PickupChoice;
  pickupRow: Prisma.PickupPointGetPayload<object>;
  fareCents: number;
}

const toOption = (p: Prisma.PickupPointGetPayload<object>): PickupOption => ({
  id: p.id,
  type: p.type,
  walkDistanceM: p.walkDistanceM,
  position: { lat: p.latitude, lng: p.longitude },
});

export class MatchingService {
  constructor(
    private readonly ctx: AppContext,
    private readonly strategy: RankingStrategy = new ScoreRanking(),
  ) {}

  // ---------------------------------------------------------------- passenger first

  /** GET /api/hop-requests/:id/matches. Only the passenger's own request; a request that is no longer open has no matches. */
  async matchesForRequest(hopRequestId: string, passengerId: string): Promise<Match[]> {
    const request = await this.ctx.db().hopRequest.findUnique({ where: { id: hopRequestId } });
    if (!request) throw new AppError('NOT_FOUND');
    assertOwner(request.passengerId, passengerId, 'this request');
    if (request.status !== 'OPEN') return [];
    return this.findJourneysFor(request);
  }

  async findJourneysFor(request: Prisma.HopRequestGetPayload<object>): Promise<Match[]> {
    const db = this.ctx.db();
    const [from, to] = await Promise.all([
      db.campusLocation.findUnique({ where: { id: request.fromLocationId }, include: { pickupPoints: true } }),
      db.campusLocation.findUnique({ where: { id: request.toLocationId } }),
    ]);
    if (!from || !to) return [];

    const window = minutes(DEFAULTS.MATCH_TIME_TOLERANCE_MIN);
    const journeys = await db.journey.findMany({
      where: {
        status: { in: ['LIVE', 'OPEN'] },
        seatsAvailable: { gt: 0 },
        driverId: { not: request.passengerId },
        route: { isNot: null },
        departureTime: { gte: new Date(request.requestedTime.getTime() - window), lte: new Date(request.requestedTime.getTime() + window) },
      },
      include: { route: true, preset: true, driver: true },
      orderBy: { departureTime: 'asc' },
      take: CANDIDATE_CAP,
    });
    if (journeys.length === 0) return [];

    // A journey this passenger already has a booking on is not offered again.
    const taken = new Set(
      (
        await db.booking.findMany({
          where: { passengerId: request.passengerId, status: { in: ['PENDING', 'CONFIRMED'] }, journeyId: { in: journeys.map((j) => j.id) } },
          select: { journeyId: true },
        })
      ).map((b) => b.journeyId),
    );
    const riders = await this.confirmedCounts(journeys.map((j) => j.id));

    const candidates: (MatchCandidate & { pickupRow: Prisma.PickupPointGetPayload<object> })[] = [];
    for (const j of journeys) {
      if (taken.has(j.id) || !withinTimeWindow(request.requestedTime, j.departureTime)) continue;
      const fit = this.fit(j, from, { lat: to.latitude, lng: to.longitude });
      if (!fit) continue;
      const route = storedPoints(j.route!.points);
      const pickupRow = from.pickupPoints.find((p) => p.id === fit.point.id)!;
      candidates.push({
        journeyId: j.id,
        driverId: j.driverId,
        driverName: j.driver.name,
        driverAvgRating: User.fromRecord(j.driver as UserRecord).averageRating,
        driverUnpaidCount: j.driver.unpaidCount,
        pickupPointId: pickupRow.id,
        walkDistanceM: pickupRow.walkDistanceM,
        detourMin: fit.detourMin,
        pickupTime: addMs(j.departureTime, Math.round(progressAlong(route, fit.point.position) * j.route!.durationSec * 1000)),
        fareCents: FareTier.calculateFare((riders.get(j.id) ?? 0) + 1),
        pickupRow,
      });
    }

    const ranked = new MatchResultSet(candidates).rank(this.strategy).all() as typeof candidates;
    return ranked.map((c) => ({
      journeyId: c.journeyId,
      driver: { id: c.driverId, name: c.driverName, avgRating: c.driverAvgRating, unpaidCount: c.driverUnpaidCount },
      pickupPoint: toPickupPoint(c.pickupRow),
      walkDistanceM: c.walkDistanceM,
      detourMin: Math.min(c.detourMin, 5),
      pickupTime: c.pickupTime.toISOString(),
      fareCents: c.fareCents,
    }));
  }

  // ---------------------------------------------------------------- driver first

  /** The open requests that fit this journey, best pickup point for each. Empty when the journey is full or not matchable. */
  async findRequestsFor(journeyId: string): Promise<RequestMatch[]> {
    const db = this.ctx.db();
    const journey = await db.journey.findUnique({ where: { id: journeyId }, include: { route: true, preset: true, driver: true } });
    if (!journey) throw new AppError('NOT_FOUND');
    if (!journey.route || journey.seatsAvailable <= 0 || !['LIVE', 'OPEN'].includes(journey.status)) return [];

    const now = this.ctx.clock.now();
    const window = minutes(DEFAULTS.MATCH_TIME_TOLERANCE_MIN);
    const requests = await db.hopRequest.findMany({
      where: {
        status: 'OPEN',
        expiresAt: { gte: now },
        passengerId: { not: journey.driverId },
        passenger: { accountStatus: 'ACTIVE' },
        requestedTime: { gte: new Date(journey.departureTime.getTime() - window), lte: new Date(journey.departureTime.getTime() + window) },
      },
      include: { from: { include: { pickupPoints: true } }, to: true, passenger: true },
      orderBy: { requestedTime: 'asc' },
      take: CANDIDATE_CAP,
    });
    if (requests.length === 0) return [];

    const fareCents = FareTier.calculateFare(((await this.confirmedCounts([journeyId])).get(journeyId) ?? 0) + 1);
    const out: RequestMatch[] = [];
    for (const r of requests) {
      if (!withinTimeWindow(r.requestedTime, journey.departureTime)) continue;
      const fit = this.fit(journey, r.from, { lat: r.to.latitude, lng: r.to.longitude });
      if (!fit) continue;
      const user = User.fromRecord(r.passenger as UserRecord);
      out.push({
        hopRequestId: r.id,
        passengerId: r.passengerId,
        passenger: { id: r.passengerId, firstName: user.firstName, avgRating: user.averageRating, unpaidCount: r.passenger.unpaidCount },
        pickup: fit,
        pickupRow: r.from.pickupPoints.find((p) => p.id === fit.point.id)!,
        fareCents,
      });
    }
    return out;
  }

  /**
   * GET /api/journeys/:id/requests: the driver's cards. First the bookings waiting for an answer (the driver can accept them), then
   * the open requests that fit and have not been booked yet (shown so the driver sees demand; the passenger books, FR 4.8).
   */
  async requestCards(journeyId: string, driverId: string): Promise<RequestCard[]> {
    const db = this.ctx.db();
    const journey = await db.journey.findUnique({ where: { id: journeyId }, include: { route: true, preset: true, driver: true } });
    if (!journey) throw new AppError('NOT_FOUND');
    assertOwner(journey.driverId, driverId, 'this journey');

    const route = journey.route ? storedPoints(journey.route.points) : [];
    const pending = await db.booking.findMany({
      where: { journeyId, status: 'PENDING' },
      include: { passenger: true, pickupPoint: true },
      orderBy: { createdAt: 'asc' },
    });
    // What accepting costs NOW: riders may have joined or left since each request was made. A full journey keeps the stored fare.
    const confirmed = await db.booking.count({ where: { journeyId, status: 'CONFIRMED', pickupStatus: { not: 'NO_SHOW' } } });
    const fareNow = Journey.fromRecord(journey as unknown as JourneyRecord).isOpenForBooking() ? FareTier.calculateFare(confirmed + 1) : null;
    const cards: RequestCard[] = pending.map((b) => {
      const user = User.fromRecord(b.passenger as UserRecord);
      return {
        bookingId: b.id,
        hopRequestId: b.hopRequestId,
        passenger: { id: b.passengerId, firstName: user.firstName, avgRating: user.averageRating, unpaidCount: b.passenger.unpaidCount },
        pickupPoint: toPickupPoint(b.pickupPoint),
        detourMin: Math.min(detourFor({ lat: b.pickupPoint.latitude, lng: b.pickupPoint.longitude }, route), 5),
        fareCentsIfAccepted: fareNow ?? b.currentFareCents,
      };
    });
    const booked = new Set(pending.map((b) => b.hopRequestId).filter((id): id is string => id !== null));
    for (const m of await this.findRequestsFor(journeyId)) {
      if (booked.has(m.hopRequestId)) continue;
      cards.push({
        bookingId: null,
        hopRequestId: m.hopRequestId,
        passenger: m.passenger,
        pickupPoint: toPickupPoint(m.pickupRow),
        detourMin: Math.min(m.pickup.detourMin, 5),
        fareCentsIfAccepted: m.fareCents,
      });
    }
    return cards;
  }

  // ---------------------------------------------------------------- internals

  /** The filters that need the route: see `fitJourney`. */
  private fit(journey: JourneyForMatching, from: PlaceWithPoints, destination: LatLng): PickupChoice | null {
    if (!journey.route) return null;
    return fitJourney({
      route: storedPoints(journey.route.points),
      allowed: journey.preset?.allowedPickupTypes ?? ALL_TYPES,
      toleranceMin: journey.preset?.detourToleranceMin ?? 5,
      destination,
      pickups: from.pickupPoints.map(toOption),
    });
  }

  private async confirmedCounts(journeyIds: string[]): Promise<Map<string, number>> {
    const rows = await this.ctx.db().booking.groupBy({
      by: ['journeyId'],
      where: { journeyId: { in: journeyIds }, status: 'CONFIRMED', pickupStatus: { not: 'NO_SHOW' } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.journeyId, r._count._all]));
  }
}
