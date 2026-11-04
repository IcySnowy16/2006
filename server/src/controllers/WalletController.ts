/** Task C2: the wallet routes (UC-20). Money is simulated; the response says so (`simulated: true`, FR 10.11). */
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { WalletService } from '../services/WalletService';

export class WalletController {
  private readonly wallets: WalletService;

  constructor(ctx: AppContext) {
    this.wallets = new WalletService(ctx);
  }

  get(req: EndpointRequest<'wallet.get'>) {
    return this.wallets.getWallet(req.user.id);
  }

  topUp(req: EndpointRequest<'wallet.topUp'>) {
    return this.wallets.topUp(req.user.id, req.valid.body.amountCents);
  }

  withdraw(req: EndpointRequest<'wallet.withdraw'>) {
    return this.wallets.withdraw(req.user.id, req.valid.body.amountCents);
  }

  transactions(req: EndpointRequest<'wallet.transactions'>) {
    return this.wallets.transactions(req.user.id);
  }
}
