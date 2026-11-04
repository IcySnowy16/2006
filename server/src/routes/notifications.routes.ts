/** Task D3: /api/notifications. `read-all` and `preferences` are mounted before `:id/read` so they are never read as an id. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { NotificationController } from '../controllers/NotificationController';
import { mount } from './mount';

export function notificationRoutes(router: Router, ctx: AppContext): void {
  const c = new NotificationController(ctx);
  mount(router, ctx, 'notifications.list', (req) => c.list(req));
  mount(router, ctx, 'notifications.readAll', (req) => c.readAll(req));
  mount(router, ctx, 'notifications.getPrefs', (req) => c.getPrefs(req));
  mount(router, ctx, 'notifications.setPrefs', (req) => c.setPrefs(req));
  mount(router, ctx, 'notifications.read', (req) => c.read(req));
}
