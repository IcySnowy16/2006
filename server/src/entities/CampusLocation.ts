/** Task F7c: a named place on campus (hall, academic node or gate) with its pickup points (FR 2.x). Seeded data, read-only. */
import type { LocationZone } from '@campus-hop/shared';
import { haversineM, type LatLng } from '../core/geo';

export class CampusLocation {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly zone: LocationZone,
    readonly isExit: boolean,
    readonly position: LatLng,
  ) {}

  /** Straight-line distance in metres. */
  distanceTo(other: CampusLocation): number {
    return haversineM(this.position, other.position);
  }
}
