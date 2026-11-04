/** Task B1: driver profile and presets (UC-3). Thin: read the validated request, call the service, return the contract shape. */
import type { Account } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import type { EndpointRequest } from '../routes/mount';
import { created, idParam } from '../routes/mount';
import { PresetService } from '../services/PresetService';

type Preset = z.infer<typeof Account.Preset>;

export class DriverController {
  private readonly service: PresetService;

  constructor(ctx: AppContext) {
    this.service = new PresetService(ctx);
  }

  saveProfile(req: EndpointRequest<'driver.saveProfile'>) {
    return this.service.saveProfile(req.user.id, req.valid.body);
  }

  list(req: EndpointRequest<'presets.list'>): Promise<Preset[]> {
    return this.service.list(req.user.id);
  }

  async create(req: EndpointRequest<'presets.create'>) {
    return created(await this.service.create(req.user.id, req.valid.body));
  }

  update(req: EndpointRequest<'presets.update'>) {
    return this.service.update(req.user.id, idParam(req), req.valid.body);
  }

  delete(req: EndpointRequest<'presets.delete'>): Promise<void> {
    return this.service.delete(req.user.id, idParam(req));
  }
}
