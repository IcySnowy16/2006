/** Task F6 (read side): GET /api/locations. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { CatalogController } from '../controllers/CatalogController';
import { mount } from './mount';

export function catalogRoutes(router: Router, ctx: AppContext): void {
  const c = new CatalogController(ctx);
  mount(router, ctx, 'catalog.locations', () => c.locations());
}
