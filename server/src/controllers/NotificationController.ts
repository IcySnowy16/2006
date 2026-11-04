/** Task D3: list, mark read, mark all read, push preference (FR 8.12, 8.13). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { idParam } from '../routes/mount';
import { NotificationService } from '../services/NotificationService';

export class NotificationController {
  constructor(
    ctx: AppContext,
    private readonly service: NotificationService = ctx.notifications ?? new NotificationService(ctx),
  ) {}

  list(req: EndpointRequest<'notifications.list'>) {
    return this.service.list(req.user.id);
  }

  read(req: EndpointRequest<'notifications.read'>): Promise<void> {
    return this.service.markRead(req.user.id, idParam(req));
  }

  readAll(req: EndpointRequest<'notifications.readAll'>): Promise<void> {
    return this.service.markAllRead(req.user.id);
  }

  getPrefs(req: EndpointRequest<'notifications.getPrefs'>) {
    return this.service.getPreferences(req.user.id);
  }

  setPrefs(req: EndpointRequest<'notifications.setPrefs'>): Promise<void> {
    return this.service.setPreferences(req.user.id, req.valid.body.push);
  }
}
