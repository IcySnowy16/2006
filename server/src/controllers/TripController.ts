/** Task D1: start, pickup status, complete and the contact route (UC-12 to UC-15). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { idParam } from '../routes/mount';
import { toBooking } from '../services/mappers';
import { TripService } from '../services/TripService';

export class TripController {
  private readonly trips: TripService;

  constructor(ctx: AppContext) {
    this.trips = new TripService(ctx);
  }

  start(req: EndpointRequest<'journeys.start'>) {
    return this.trips.start(req.user.id, idParam(req), req.valid.body);
  }

  complete(req: EndpointRequest<'journeys.complete'>) {
    return this.trips.complete(req.user.id, idParam(req));
  }

  async pickupStatus(req: EndpointRequest<'bookings.pickupStatus'>) {
    return toBooking(await this.trips.updatePickupStatus(req.user.id, idParam(req), req.valid.body.status));
  }

  contact(req: EndpointRequest<'bookings.contact'>) {
    return this.trips.getContact(req.user.id, idParam(req));
  }
}
