/** Tasks B5a, B5b: /api/hop-requests. A locked account may not ask (FR 10.8); an unverified one may not either (NFR-2.1). */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { HopController } from '../controllers/HopController';
import { requireUnlocked, requireVerified } from '../middleware/requireUnlocked';
import { mount } from './mount';

export function hopRoutes(router: Router, ctx: AppContext): void {
  const c = new HopController(ctx);
  mount(router, ctx, 'hops.create', (req) => c.create(req), { extra: [requireVerified, requireUnlocked] });
  mount(router, ctx, 'hops.mine', (req) => c.mine(req));
  mount(router, ctx, 'hops.cancel', (req) => c.cancel(req));
  mount(router, ctx, 'hops.matches', (req) => c.matches(req));
}
