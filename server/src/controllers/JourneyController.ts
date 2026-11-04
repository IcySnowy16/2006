/** Tasks B3, B4, B5b: go live, my journeys, cancel, pre-start position, request cards (UC-4, UC-5, UC-8). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { created, idParam } from '../routes/mount';
import { GeofenceService } from '../services/GeofenceService';
import { JourneyService } from '../services/JourneyService';
import { toJourney } from '../services/mappers';
import { MatchingService } from '../services/MatchingService';

export class JourneyController {
  private readonly journeys: JourneyService;
  private readonly geofence: GeofenceService;
  private readonly matching: MatchingService;

  constructor(ctx: AppContext) {
    this.journeys = new JourneyService(ctx);
    this.geofence = new GeofenceService(ctx);
    this.matching = new MatchingService(ctx);
  }

  async goLive(req: EndpointRequest<'journeys.goLive'>) {
    return created(await this.journeys.goLive(req.user.id, req.valid.body));
  }

  mine(req: EndpointRequest<'journeys.mine'>) {
    return this.journeys.mine(req.user.id);
  }

  async cancel(req: EndpointRequest<'journeys.cancel'>) {
    return toJourney(await this.journeys.cancel(idParam(req), 'DRIVER', req.user.id));
  }

  async position(req: EndpointRequest<'journeys.position'>): Promise<void> {
    await this.geofence.checkPosition(idParam(req), req.user.id, req.valid.body);
  }

  requests(req: EndpointRequest<'journeys.requests'>) {
    return this.matching.requestCards(idParam(req), req.user.id);
  }
}
