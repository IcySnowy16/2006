/**
 * Task D4: the work of each timer, as plain functions so a test can call one at a chosen moment with a FakeClock.
 * Every sweep reads deadlines STORED ON ROWS (liveExpiresAt, arrivedAt, completedAt, lastPaidTripDate), never an in-memory timer, so a
 * restart loses nothing; and every sweep is idempotent: running it twice in a row changes nothing the second time.
 */
import { DEFAULTS } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { addMs, minutes, sgDate } from '../core/clock';
import { LocationService } from '../realtime/LocationService';
import { BookingService } from '../services/BookingService';
import { GeofenceService } from '../services/GeofenceService';
import { HopRequestService } from '../services/HopRequestService';

export class Sweeps {
  private readonly geofence: GeofenceService;
  private readonly bookings: BookingService;
  private readonly requests: HopRequestService;
  private readonly locations: LocationService;
  /** Bookings whose No-show window has been announced. In memory is enough: a repeat after a restart only re-enables a button. */
  private readonly announced = new Set<string>();

  constructor(
    private readonly ctx: AppContext,
    locations?: LocationService, // the gateway's, so the purge clears the same in-memory throttle map
  ) {
    this.geofence = new GeofenceService(ctx);
    this.bookings = new BookingService(ctx);
    this.requests = new HopRequestService(ctx);
    this.locations = locations ?? new LocationService(ctx);
  }

  /** (1) LIVE journeys with no confirmed booking past their window become EXPIRED (FR 3.5, UC-4.EX.3). */
  async expireJourneys(): Promise<string[]> {
    return this.geofence.expireDue();
  }

  /** (2) Requests nobody answered before the trip started are declined (FR 5.5), and hop requests past their window expire. */
  async declineAndExpire(): Promise<{ declined: number; expiredRequests: number }> {
    return { declined: await this.bookings.declineUnanswered(), expiredRequests: await this.requests.expireDue() };
  }

  /** (3) Three minutes after ARRIVED the driver may mark a no-show (FR 6.7). Announces each booking once. */
  async openNoShowWindows(): Promise<string[]> {
    const cutoff = addMs(this.ctx.clock.now(), -minutes(DEFAULTS.NO_SHOW_WAIT_MIN));
    const due = await this.ctx.db().booking.findMany({
      where: { status: 'CONFIRMED', pickupStatus: 'ARRIVED', arrivedAt: { lte: cutoff }, journey: { status: 'IN_PROGRESS' } },
      include: { journey: { select: { driverId: true } } },
    });
    // Forget bookings that left ARRIVED (picked up, no-show, trip over), so the set does not grow for the life of the process.
    const stillDue = new Set(due.map((b) => b.id));
    for (const id of this.announced) if (!stillDue.has(id)) this.announced.delete(id);
    const opened: string[] = [];
    for (const b of due) {
      if (this.announced.has(b.id)) continue;
      this.announced.add(b.id);
      opened.push(b.id);
      await this.ctx.bus.emit('NoShowWindowOpened', { bookingId: b.id, journeyId: b.journeyId, driverId: b.journey.driverId });
    }
    return opened;
  }

  /** (4) Stop sharing: positions of journeys that ended more than the sharing-stop window ago are deleted (FR 7.12). */
  async purgeSharing(): Promise<string[]> {
    return this.locations.purgeFinished();
  }

  /**
   * (5) At 00:00 Singapore time every driver's daily counter goes back to 0. Written as "every counter whose date is not today", so
   * it can run at any time, any number of times. The start-trip check also compares the stored date, so a missed run can never
   * wrongly block a driver.
   */
  async resetDailyCounters(): Promise<number> {
    const today = sgDate(this.ctx.clock.now());
    const result = await this.ctx.db().driverProfile.updateMany({
      where: { dailyPaidTrips: { gt: 0 }, OR: [{ lastPaidTripDate: null }, { lastPaidTripDate: { not: today } }] },
      data: { dailyPaidTrips: 0 },
    });
    return result.count;
  }

  /** (6) Push notifications that failed are tried again with back-off (NFR-1.3). */
  async retryPushes(): Promise<number> {
    return this.ctx.notifications?.retryDue() ?? 0;
  }
}
