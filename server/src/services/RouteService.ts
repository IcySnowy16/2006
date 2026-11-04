/**
 * Task B2: the driver's route (UC-6). Asked from the MapsAdapter ONCE, at go-live, and then stored on the journey, so matching
 * and the live map never call Maps again (13 Oct decision). A Maps error or timeout is EXTERNAL_SERVICE_UNAVAILABLE (UC-6.EX.1)
 * and the caller writes nothing.
 *
 * The same origin and destination asked again within a few minutes reuse the answer (a driver who cancels and goes live again
 * at once must not pay for a second request). The key lives in the adapter, never here.
 */
import type { DrivingRoute } from '../adapters/MapsAdapter';
import type { AppContext } from '../context';
import type { LatLng } from '../core/geo';
import type { Tx } from '../core/transaction';

const REUSE_MS = 10 * 60_000;

interface Cached {
  route: DrivingRoute;
  at: number;
}

export class RouteService {
  private readonly cache = new Map<string, Cached>();

  constructor(private readonly ctx: AppContext) {}

  /** Rounded to 4 decimals (about 10 m), so GPS jitter between two taps still hits the cache. */
  private key(from: LatLng, to: LatLng): string {
    const r = (n: number) => n.toFixed(4);
    return `${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}`;
  }

  async calculate(from: LatLng, to: LatLng, departAt: Date): Promise<DrivingRoute> {
    const k = this.key(from, to);
    const hit = this.cache.get(k);
    const now = this.ctx.clock.now().getTime();
    if (hit && now - hit.at < REUSE_MS) return hit.route;
    const route = await this.ctx.adapters.maps.route(from, to, departAt); // throws EXTERNAL_SERVICE_UNAVAILABLE
    this.cache.set(k, { route, at: now });
    return route;
  }

  /** Save the route on a journey inside the caller's transaction. */
  async store(tx: Tx, journeyId: string, route: DrivingRoute): Promise<void> {
    await tx.route.create({
      data: {
        journeyId,
        polyline: route.polyline,
        points: route.points.map((p) => [p.lat, p.lng]),
        durationSec: route.durationSec,
        distanceM: route.distanceM,
      },
    });
  }
}

/** Reads the stored points back as LatLng. They are saved as [lat, lng] pairs; {lat, lng} objects (test data) are accepted too. */
export function storedPoints(json: unknown): LatLng[] {
  if (!Array.isArray(json)) return [];
  const out: LatLng[] = [];
  for (const p of json as unknown[]) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') out.push({ lat: p[0], lng: p[1] });
    else if (p && typeof p === 'object' && typeof (p as LatLng).lat === 'number' && typeof (p as LatLng).lng === 'number')
      out.push({ lat: (p as LatLng).lat, lng: (p as LatLng).lng });
  }
  return out;
}
