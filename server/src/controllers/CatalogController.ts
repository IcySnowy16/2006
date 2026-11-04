/** Task F6 (read side): the campus places and their pickup points (UC-3, UC-4, UC-7). Read-only data. */
import type { Hop } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { toPickupPoint } from '../services/mappers';

export class CatalogController {
  constructor(private readonly ctx: AppContext) {}

  async locations(): Promise<z.infer<typeof Hop.LocationList>> {
    const rows = await this.ctx.db().campusLocation.findMany({ include: { pickupPoints: true }, orderBy: { name: 'asc' } });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      zone: l.zone,
      isExit: l.isExit,
      position: { lat: l.latitude, lng: l.longitude },
      pickupPoints: l.pickupPoints.map(toPickupPoint),
    }));
  }
}
