/** Task A2: turns HTTP into AuthService calls and back (UC-1, UC-2). Bodies are already validated by `validate`. */
import type { Response } from 'express';
import type { Me } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { clearSessionCookie, setSessionCookie } from '../auth/session';
import { AuthService } from '../services/AuthService';
import { created, type EndpointRequest } from '../routes/mount';

export class AuthController {
  private readonly service: AuthService;

  constructor(private readonly ctx: AppContext) {
    this.service = new AuthService(ctx);
  }

  async register(req: EndpointRequest<'auth.register'>) {
    return created(await this.service.register(req.valid.body));
  }

  async verify(req: EndpointRequest<'auth.verify'>): Promise<void> {
    await this.service.verify(req.valid.body.ntuEmail, req.valid.body.code);
  }

  async resend(req: EndpointRequest<'auth.resend'>): Promise<void> {
    await this.service.resend(req.valid.body.ntuEmail);
  }

  async login(req: EndpointRequest<'auth.login'>, res: Response): Promise<Me> {
    const { token, me } = await this.service.login(req.valid.body.ntuEmail, req.valid.body.password);
    setSessionCookie(res, token, this.ctx.config);
    return me;
  }

  async logout(req: EndpointRequest<'auth.logout'>, res: Response): Promise<void> {
    await this.service.signOutEverywhere(req.user.id); // every older token for this user stops working, not just this cookie
    clearSessionCookie(res, this.ctx.config);
  }

  async me(req: EndpointRequest<'auth.me'>): Promise<Me> {
    return this.service.me(req.user.id, req.user.activeRole);
  }
}
