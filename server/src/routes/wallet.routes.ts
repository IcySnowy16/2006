/** Task C2: /api/wallet. A locked account can still see and top up its wallet, so no requireUnlocked here (FR 10.8). */
import type { Router } from 'express';
import type { AppContext } from '../context';
import { WalletController } from '../controllers/WalletController';
import { mount } from './mount';

export function walletRoutes(router: Router, ctx: AppContext): void {
  const c = new WalletController(ctx);
  mount(router, ctx, 'wallet.get', (req) => c.get(req));
  mount(router, ctx, 'wallet.topUp', (req) => c.topUp(req));
  mount(router, ctx, 'wallet.withdraw', (req) => c.withdraw(req));
  mount(router, ctx, 'wallet.transactions', (req) => c.transactions(req));
}
