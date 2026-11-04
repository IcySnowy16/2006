/** Task E1: history and rating (UC-19). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { idParam } from '../routes/mount';
import { HistoryService } from '../services/HistoryService';

export class HistoryController {
  private readonly service: HistoryService;

  constructor(ctx: AppContext) {
    this.service = new HistoryService(ctx);
  }

  list(req: EndpointRequest<'history.list'>) {
    return this.service.list(req.user.id);
  }

  /** The endpoint table says the rating route answers 204 No Content (response: null); the table is the contract. */
  rate(req: EndpointRequest<'ratings.create'>): Promise<void> {
    return this.service.rate(req.user.id, idParam(req), req.valid.body);
  }
}
