/** Tasks B5a and B5b: post a hop request, list mine, see its matches (UC-7, UC-8). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { created, idParam } from '../routes/mount';
import { HopRequestService } from '../services/HopRequestService';
import { MatchingService } from '../services/MatchingService';

export class HopController {
  private readonly requests: HopRequestService;
  private readonly matching: MatchingService;

  constructor(ctx: AppContext) {
    this.requests = new HopRequestService(ctx);
    this.matching = new MatchingService(ctx);
  }

  async create(req: EndpointRequest<'hops.create'>) {
    return created(await this.requests.create(req.user.id, req.valid.body));
  }

  mine(req: EndpointRequest<'hops.mine'>) {
    return this.requests.mine(req.user.id);
  }

  cancel(req: EndpointRequest<'hops.cancel'>) {
    return this.requests.cancel(req.user.id, idParam(req));
  }

  matches(req: EndpointRequest<'hops.matches'>) {
    return this.matching.matchesForRequest(idParam(req), req.user.id);
  }
}
