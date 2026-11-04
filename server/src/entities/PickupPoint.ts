/** Task F7c: a bus stop or car park next to a campus location where a rider is picked up or dropped off. Data holder. */
import type { PickupType } from '@campus-hop/shared';
import type { LatLng } from '../core/geo';

export class PickupPoint {
  constructor(
    readonly id: string,
    readonly locationId: string,
    readonly type: PickupType,
    readonly walkDistanceM: number,
    readonly position: LatLng,
    readonly accessNote: string | null,
  ) {}
}
