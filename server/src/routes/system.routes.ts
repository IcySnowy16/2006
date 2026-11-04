/** Task K15: GET /api/features (which optional features are on). The health route is in health.routes.ts (task F3). */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { mount } from './mount';

export function systemRoutes(router: Router, ctx: AppContext): void {
  mount(router, ctx, 'system.features', () => ctx.flags);
}
