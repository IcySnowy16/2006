/** Task A2: /api/auth/* (UC-1, UC-2). One `mount` line per route of the endpoint table. */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { AuthController } from '../controllers/AuthController';
import { mount } from './mount';

export function authRoutes(router: Router, ctx: AppContext): void {
  const c = new AuthController(ctx);
  mount(router, ctx, 'auth.register', (req) => c.register(req));
  mount(router, ctx, 'auth.verify', (req) => c.verify(req));
  mount(router, ctx, 'auth.resend', (req) => c.resend(req));
  mount(router, ctx, 'auth.login', (req, res) => c.login(req, res));
  mount(router, ctx, 'auth.logout', (req, res) => c.logout(req, res));
  mount(router, ctx, 'auth.me', (req) => c.me(req));
}
