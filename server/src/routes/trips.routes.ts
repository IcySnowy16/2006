/** Task D1: /api/journeys/:id/start, /complete, /api/bookings/:id/pickup-status and /contact. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { TripController } from '../controllers/TripController';
import { mount } from './mount';

export function tripRoutes(router: Router, ctx: AppContext): void {
  const c = new TripController(ctx);
  mount(router, ctx, 'journeys.start', (req) => c.start(req));
  mount(router, ctx, 'journeys.complete', (req) => c.complete(req));
  mount(router, ctx, 'bookings.pickupStatus', (req) => c.pickupStatus(req));
  mount(router, ctx, 'bookings.contact', (req) => c.contact(req));
}
