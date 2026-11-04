/** Task A6: choose or switch the active role, add the passenger role (UC-2, UC-3). */
import type { Response } from 'express';
import type { Me } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { setSessionCookie } from '../auth/session';
import { RoleService } from '../services/RoleService';
import type { EndpointRequest } from '../routes/mount';

export class RoleController {
  private readonly service: RoleService;

  constructor(private readonly ctx: AppContext) {
    this.service = new RoleService(ctx);
  }

  async setActiveRole(req: EndpointRequest<'me.activeRole'>, res: Response): Promise<Me> {
    const { token, me } = await this.service.setActiveRole(req.user.id, req.valid.body.role, req.user.activeRole);
    setSessionCookie(res, token, this.ctx.config);
    return me;
  }

  async addRole(req: EndpointRequest<'me.addRole'>, res: Response): Promise<Me> {
    const { token, me } = await this.service.addPassengerRole(req.user.id, req.user.activeRole);
    setSessionCookie(res, token, this.ctx.config);
    return me;
  }
}
