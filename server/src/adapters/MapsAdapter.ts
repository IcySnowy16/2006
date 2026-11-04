/** Task K5: routes. The real adapter is GoogleMapsAdapter (task B2). OneMap is the documented fallback: same interface. */
import type { LatLng } from '../core/geo';

export interface DrivingRoute {
  /** Google encoded polyline, sent to the client as it is. */
  polyline: string;
  /** The same route as points, kept for matching distances. */
  points: LatLng[];
  durationSec: number;
  distanceM: number;
}

export interface MapsAdapter {
  /** The driver's driving route. Called once, at go-live (UC-6). */
  route(from: LatLng, to: LatLng, departAt: Date): Promise<DrivingRoute>;
  /** Walking distance in metres. Only the seed script uses it; at runtime the stored PickupPoint.walkDistanceM is used. */
  walkingDistance(a: LatLng, b: LatLng): Promise<number>;
}
