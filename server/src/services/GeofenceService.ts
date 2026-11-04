/**
 * Task B4: the geofence and the expiry hook.
 *
 * Geofence (UC-5.EX.1, FR 3.8.1/3.8.2): before the trip starts the driver's phone posts its position about every 5 seconds. A
 * position OUTSIDE the campus polygon plus the grace margin (GEOFENCE_GRACE_M, SRS Q12 default 200 m) counts as one outside
 * reading; the journey is cancelled with reason GEOFENCE on the second reading in a row (dwell rule, so one bad fix never cancels).
 * A reading inside resets the count. A reading less accurate than the margin proves nothing and is ignored. Once the journey is
 * IN_PROGRESS (or no longer live) a position never cancels it.
 *
 * Without a boundary configured (CAMPUS_BOUNDARY) the geofence is OFF: see config/campusBoundary.ts.
 *
 * Expiry (UC-5.EX.2, FR 3.5): a LIVE journey whose window (LIVE_WINDOW_MIN, SRS Q7 default 15 minutes) passed with no CONFIRMED
 * booking becomes EXPIRED; its PENDING bookings are cancelled; the driver is told. D4 runs `expireDue` on a timer.
 */
import type { Position } from '@campus-hop/shared';
import { GEOFENCE_CONSECUTIVE_READINGS, loadCampusBoundary } from '../config/campusBoundary';
import type { AppContext } from '../context';
import { distanceToPolygonEdgeM, pointInPolygon, type LatLng } from '../core/geo';
import { lockJourney, withTransaction } from '../core/transaction';
import { Booking, type BookingRecord } from '../entities/Booking';
import { Journey, type JourneyRecord } from '../entities/Journey';
import { AppError } from '../errors/AppError';
import { EventQueue } from '../events/bus';
import { assertOwner } from '../middleware/ownership';
import { JourneyService } from './JourneyService';

export class GeofenceService {
  private readonly boundary: LatLng[] | null;
  private readonly journeys: JourneyService;

  constructor(
    private readonly ctx: AppContext,
    boundary?: LatLng[] | null,
  ) {
    this.boundary = boundary === undefined ? loadCampusBoundary(ctx.config.CAMPUS_BOUNDARY) : boundary;
    this.journeys = new JourneyService(ctx);
  }

  /** True when the point is outside the polygon AND farther than the margin from its edge. */
  isOutside(p: LatLng): boolean {
    if (!this.boundary) return false;
    if (pointInPolygon(p, this.boundary)) return false;
    return distanceToPolygonEdgeM(p, this.boundary) > this.ctx.config.GEOFENCE_GRACE_M;
  }

  /** POST /api/journeys/:id/position. Returns true if this reading cancelled the journey. */
  async checkPosition(journeyId: string, driverId: string, position: Position): Promise<boolean> {
    const db = this.ctx.db();
    const found = await db.journey.findUnique({ where: { id: journeyId } });
    if (!found) throw new AppError('NOT_FOUND');
    assertOwner(found.driverId, driverId, 'this journey');
    if (!['LIVE', 'OPEN', 'FULL'].includes(found.status)) return false; // never fires once the trip is in progress
    if (!this.boundary || position.accuracyM > this.ctx.config.GEOFENCE_GRACE_M) return false;

    if (!this.isOutside({ lat: position.lat, lng: position.lng })) {
      if (found.outsideReadings !== 0) await db.journey.update({ where: { id: journeyId }, data: { outsideReadings: 0 } });
      return false;
    }
    const updated = await db.journey.update({ where: { id: journeyId }, data: { outsideReadings: { increment: 1 } } });
    if (updated.outsideReadings < GEOFENCE_CONSECUTIVE_READINGS) return false;
    try {
      await this.journeys.cancel(journeyId, 'GEOFENCE');
      return true;
    } catch (err) {
      if (err instanceof AppError && err.code === 'ILLEGAL_STATE_TRANSITION') return false; // the trip started in the meantime
      throw err;
    }
  }

  /** The expiry hook. Returns the ids of the journeys it expired. */
  async expireDue(): Promise<string[]> {
    const db = this.ctx.db();
    const now = this.ctx.clock.now();
    const due = await db.journey.findMany({ where: { status: 'LIVE', liveExpiresAt: { lte: now } }, select: { id: true } });
    const expired: string[] = [];
    for (const { id } of due) {
      const queue = new EventQueue();
      const done = await withTransaction(async (tx) => {
        await lockJourney(tx, id);
        const row = await tx.journey.findUnique({ where: { id } });
        if (!row || row.status !== 'LIVE' || row.liveExpiresAt > now) return false;
        if ((await tx.booking.count({ where: { journeyId: id, status: 'CONFIRMED' } })) > 0) return false;
        const journey = Journey.fromRecord(row as unknown as JourneyRecord);
        journey.expire();
        for (const b of await tx.booking.findMany({ where: { journeyId: id, status: 'PENDING' } })) {
          const entity = Booking.fromRecord(b as BookingRecord);
          entity.cancel();
          await tx.booking.update({ where: { id: b.id }, data: { status: entity.status } });
          queue.push('BookingDeclined', { bookingId: b.id, journeyId: id, driverId: row.driverId, passengerId: b.passengerId, automatic: true });
        }
        await tx.journey.update({ where: { id }, data: { status: journey.status, cancelReason: 'EXPIRED' } });
        queue.push('JourneyExpired', { journeyId: id, driverId: row.driverId });
        return true;
      });
      if (done) {
        expired.push(id);
        await this.ctx.bus.publish(queue);
      }
    }
    return expired;
  }
}
