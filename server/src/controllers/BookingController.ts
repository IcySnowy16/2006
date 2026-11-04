/** Task C3: the booking routes (UC-7, UC-10, UC-11). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { created, idParam } from '../routes/mount';
import { BookingService } from '../services/BookingService';

export class BookingController {
  private readonly service: BookingService;

  constructor(ctx: AppContext) {
    this.service = new BookingService(ctx);
  }

  preview(req: EndpointRequest<'bookings.preview'>) {
    return this.service.preview(req.user.id, req.valid.query.journeyId);
  }

  async create(req: EndpointRequest<'bookings.create'>) {
    return created(await this.service.book(req.user.id, req.valid.body));
  }

  get(req: EndpointRequest<'bookings.get'>) {
    return this.service.get(req.user.id, idParam(req));
  }

  forJourney(req: EndpointRequest<'bookings.forJourney'>) {
    return this.service.forJourney(req.user.id, idParam(req));
  }

  accept(req: EndpointRequest<'bookings.accept'>) {
    return this.service.accept(req.user.id, idParam(req));
  }

  decline(req: EndpointRequest<'bookings.decline'>) {
    return this.service.decline(req.user.id, idParam(req));
  }

  cancel(req: EndpointRequest<'bookings.cancel'>) {
    return this.service.cancel(req.user.id, idParam(req));
  }
}
