import { Router } from 'express';
import type { AppContext } from '../context';
import { authRoutes } from './auth.routes';
import { bookingRoutes } from './bookings.routes';
import { catalogRoutes } from './catalog.routes';
import { driverRoutes } from './driver.routes';
import { healthRouter, type HealthOptions } from './health.routes';
import { historyRoutes } from './history.routes';
import { hopRoutes } from './hops.routes';
import { journeyRoutes } from './journeys.routes';
import { mountMissing } from './mount';
import { notificationRoutes } from './notifications.routes';
import { rolesRoutes } from './roles.routes';
import { systemRoutes } from './system.routes';
import { tripRoutes } from './trips.routes';
import { walletRoutes } from './wallet.routes';

export interface ApiOptions {
  health?: HealthOptions;
  /** With a context, every route of the endpoint table is mounted. Without one only /api/health exists (unit tests of the app shell). */
  ctx?: AppContext;
}

/**
 * Everything under /api. ONE line per route package, so lanes never edit the same line. Any route of the endpoint table
 * that no package mounted answers 501 NOT_IMPLEMENTED until it is built (task F15).
 */
export function apiRouter(options: ApiOptions = {}): Router {
  const api = Router();
  const ctx = options.ctx;
  const health: HealthOptions = {
    now: ctx ? () => ctx.clock.now() : undefined,
    checks: ctx ? { database: async () => void (await ctx.db().$queryRaw`SELECT 1`) } : undefined,
    ...options.health,
  };
  api.use(healthRouter(health));
  if (ctx) {
    systemRoutes(api, ctx);
    authRoutes(api, ctx);
    rolesRoutes(api, ctx);
    catalogRoutes(api, ctx);
    driverRoutes(api, ctx);
    journeyRoutes(api, ctx);
    hopRoutes(api, ctx);
    bookingRoutes(api, ctx);
    tripRoutes(api, ctx);
    notificationRoutes(api, ctx);
    historyRoutes(api, ctx);
    walletRoutes(api, ctx);
    mountMissing(api, ctx, ['system.health']);
  }
  return api;
}
