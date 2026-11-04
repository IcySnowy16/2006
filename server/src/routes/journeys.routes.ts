/** Tasks B3, B4, B5b: /api/journeys. Going live needs a verified e-mail (NFR-2.1). */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { JourneyController } from '../controllers/JourneyController';
import { requireVerified } from '../middleware/requireUnlocked';
import { mount } from './mount';

export function journeyRoutes(router: Router, ctx: AppContext): void {
  const c = new JourneyController(ctx);
  mount(router, ctx, 'journeys.goLive', (req) => c.goLive(req), { extra: [requireVerified] });
  mount(router, ctx, 'journeys.mine', (req) => c.mine(req));
  mount(router, ctx, 'journeys.cancel', (req) => c.cancel(req));
  mount(router, ctx, 'journeys.position', (req) => c.position(req));
  mount(router, ctx, 'journeys.requests', (req) => c.requests(req));
}
