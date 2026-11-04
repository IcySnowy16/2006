/** Task F7b: the driver's route, calculated once at go-live (UC-6). Matching measures distances against `points` (no Maps call). */
import type { LatLng } from '../core/geo';
import { distanceToPolylineM } from '../core/geo';

export interface RouteRecord {
  polyline: string;
  points: LatLng[];
  durationSec: number;
  distanceM: number;
}

export class Route {
  private constructor(private readonly rec: RouteRecord) {}

  static fromRecord(rec: RouteRecord): Route {
    return new Route({ ...rec, points: rec.points.map((p) => ({ ...p })) });
  }

  toRecord(): RouteRecord {
    return { ...this.rec, points: this.rec.points.map((p) => ({ ...p })) };
  }

  get points(): readonly LatLng[] {
    return this.rec.points;
  }
  get durationSec(): number {
    return this.rec.durationSec;
  }

  /** Shortest distance in metres from a point to this route. */
  distanceFrom(p: LatLng): number {
    return distanceToPolylineM(p, this.rec.points);
  }
}
