/**
 * Task D2: the rules of live location, apart from the socket plumbing so they can be tested on their own.
 *
 *  - Who may join a journey room (NFR-5.5, FR 7.3): the journey's driver, or a passenger with a CONFIRMED booking, and only while the
 *    journey is IN_PROGRESS (SRS Q10 default: no live location before pickup). Anyone else is FORBIDDEN, a participant of a trip
 *    that is not running gets TRIP_NOT_ACTIVE.
 *  - What a driver update does: it is throttled to one per second, stored, fanned out, and compared with each waiting rider's pickup
 *    point: within 300 m the rider is APPROACHING, within 30 m ARRIVED (FR 7.7, 7.8). A very inaccurate fix does not change a status.
 *  - When it stops (FR 7.10, 7.12, NFR-5.3, NFR-5.4): only an IN_PROGRESS journey collects positions, plus 30 seconds after completion
 *    (SHARING_STOP_SECONDS) for the last fix; later updates are dropped, and `purgeFinished` deletes the stored positions.
 */
import { DEFAULTS, type Position } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { addMs } from '../core/clock';
import { haversineM } from '../core/geo';
import { AppError } from '../errors/AppError';
import { TripService } from '../services/TripService';

export interface UpdateResult {
  /** False when the update was ignored (too soon after the last one, or sharing has stopped). */
  accepted: boolean;
  /** Bookings whose pickup status this update changed. */
  changed: { bookingId: string; status: 'APPROACHING' | 'ARRIVED'; distanceM: number; etaSec: number }[];
}

export class LocationService {
  private readonly lastAt = new Map<string, number>();
  private readonly trips: TripService;

  constructor(private readonly ctx: AppContext) {
    this.trips = new TripService(ctx);
  }

  /** Throws FORBIDDEN or TRIP_NOT_ACTIVE. Called before the socket joins the room. */
  async assertCanJoin(userId: string, journeyId: string): Promise<void> {
    const journey = await this.ctx.db().journey.findUnique({ where: { id: journeyId }, select: { driverId: true, status: true } });
    if (!journey) throw new AppError('FORBIDDEN'); // same answer as for a stranger: do not reveal which journeys exist
    const isDriver = journey.driverId === userId;
    if (!isDriver) {
      // Still waiting or riding: after drop-off, a no-show or an unpaid ride the rider may no longer see the car (FR 7.10).
      const confirmed = await this.ctx.db().booking.count({
        where: { journeyId, passengerId: userId, status: 'CONFIRMED', pickupStatus: { notIn: ['DROPPED_OFF', 'NO_SHOW', 'UNPAID'] } },
      });
      if (confirmed === 0) throw new AppError('FORBIDDEN');
    }
    if (journey.status !== 'IN_PROGRESS') throw new AppError('TRIP_NOT_ACTIVE');
  }

  async handleUpdate(driverId: string, journeyId: string, position: Position): Promise<UpdateResult> {
    const db = this.ctx.db();
    const journey = await db.journey.findUnique({ where: { id: journeyId } });
    if (!journey || journey.driverId !== driverId) throw new AppError('FORBIDDEN');

    const now = this.ctx.clock.now();
    const stopAt = journey.completedAt ? addMs(journey.completedAt, this.ctx.config.SHARING_STOP_SECONDS * 1000) : null;
    const collecting = journey.status === 'IN_PROGRESS' || (journey.status === 'COMPLETED' && stopAt !== null && now.getTime() <= stopAt.getTime());
    if (!collecting) {
      if (journey.status === 'COMPLETED' || journey.status === 'CANCELLED') return { accepted: false, changed: [] }; // dropped quietly
      throw new AppError('TRIP_NOT_ACTIVE');
    }

    const last = this.lastAt.get(journeyId);
    if (last !== undefined && now.getTime() - last < DEFAULTS.LOCATION_MIN_INTERVAL_MS) return { accepted: false, changed: [] };
    this.lastAt.set(journeyId, now.getTime());

    await db.locationUpdate.create({
      data: { journeyId, latitude: position.lat, longitude: position.lng, accuracyM: position.accuracyM, timestamp: new Date(position.ts) },
    });
    this.ctx.realtime?.emitToJourney(journeyId, 'location:update', { journeyId, position });

    const changed: UpdateResult['changed'] = [];
    if (journey.status === 'IN_PROGRESS' && position.accuracyM <= DEFAULTS.LOW_ACCURACY_M) {
      const waiting = await db.booking.findMany({
        where: { journeyId, status: 'CONFIRMED', pickupStatus: { in: ['WAITING', 'APPROACHING'] } },
        include: { pickupPoint: true },
      });
      for (const b of waiting) {
        const distanceM = Math.round(haversineM({ lat: position.lat, lng: position.lng }, { lat: b.pickupPoint.latitude, lng: b.pickupPoint.longitude }));
        const etaSec = Math.round(distanceM / ((DEFAULTS.AVG_SPEED_KMH * 1000) / 3600));
        const next = distanceM <= DEFAULTS.ARRIVED_M ? 'ARRIVED' : distanceM <= DEFAULTS.APPROACHING_M && b.pickupStatus === 'WAITING' ? 'APPROACHING' : null;
        if (!next) continue;
        await this.trips.systemPickupStatus(b.id, next, distanceM, etaSec);
        changed.push({ bookingId: b.id, status: next, distanceM, etaSec });
      }
    }
    return { accepted: true, changed };
  }

  /**
   * Sharing has stopped for journeys that ended more than SHARING_STOP_SECONDS ago: delete their positions and close their rooms
   * (FR 7.12). Idempotent. Returns the journeys cleaned.
   */
  async purgeFinished(): Promise<string[]> {
    const db = this.ctx.db();
    const cutoff = addMs(this.ctx.clock.now(), -this.ctx.config.SHARING_STOP_SECONDS * 1000);
    const ended = await db.journey.findMany({
      where: { OR: [{ status: 'COMPLETED', completedAt: { lte: cutoff } }, { status: { in: ['CANCELLED', 'EXPIRED'] } }], locationUpdates: { some: {} } },
      select: { id: true },
    });
    for (const { id } of ended) {
      await db.locationUpdate.deleteMany({ where: { journeyId: id } });
      this.ctx.realtime?.closeJourney?.(id);
      this.lastAt.delete(id);
    }
    return ended.map((j) => j.id);
  }
}
