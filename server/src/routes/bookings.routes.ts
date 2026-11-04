/**
 * Task C3: /api/bookings. Booking needs an unlocked, verified account (FR 10.8, NFR-2.1). A LOCKED passenger may still cancel
 * (UC-11), so cancel has no requireUnlocked. `preview` is mounted before `:id` so it is not read as an id.
 */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { BookingController } from '../controllers/BookingController';
import { requireUnlocked, requireVerified } from '../middleware/requireUnlocked';
import { mount } from './mount';

export function bookingRoutes(router: Router, ctx: AppContext): void {
  const c = new BookingController(ctx);
  mount(router, ctx, 'bookings.preview', (req) => c.preview(req));
  mount(router, ctx, 'bookings.create', (req) => c.create(req), { extra: [requireVerified, requireUnlocked] });
  mount(router, ctx, 'bookings.forJourney', (req) => c.forJourney(req));
  mount(router, ctx, 'bookings.get', (req) => c.get(req));
  mount(router, ctx, 'bookings.accept', (req) => c.accept(req));
  mount(router, ctx, 'bookings.decline', (req) => c.decline(req));
  mount(router, ctx, 'bookings.cancel', (req) => c.cancel(req));
}
