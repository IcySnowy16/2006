/** Task E1: /api/history and /api/bookings/:id/ratings. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { HistoryController } from '../controllers/HistoryController';
import { mount } from './mount';

export function historyRoutes(router: Router, ctx: AppContext): void {
  const c = new HistoryController(ctx);
  mount(router, ctx, 'history.list', (req) => c.list(req));
  mount(router, ctx, 'ratings.create', (req) => c.rate(req));
}
