/** Task B1: /api/driver/profile and /api/presets. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { DriverController } from '../controllers/DriverController';
import { mount } from './mount';

export function driverRoutes(router: Router, ctx: AppContext): void {
  const c = new DriverController(ctx);
  mount(router, ctx, 'driver.saveProfile', (req) => c.saveProfile(req));
  mount(router, ctx, 'presets.list', (req) => c.list(req));
  mount(router, ctx, 'presets.create', (req) => c.create(req));
  mount(router, ctx, 'presets.update', (req) => c.update(req));
  mount(router, ctx, 'presets.delete', (req) => c.delete(req));
}
