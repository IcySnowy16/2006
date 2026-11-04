/** Task A6: /api/me/active-role and /api/me/roles. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { RoleController } from '../controllers/RoleController';
import { mount } from './mount';

export function rolesRoutes(router: Router, ctx: AppContext): void {
  const c = new RoleController(ctx);
  mount(router, ctx, 'me.activeRole', (req, res) => c.setActiveRole(req, res));
  mount(router, ctx, 'me.addRole', (req, res) => c.addRole(req, res));
}
