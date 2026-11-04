/**
 * Task B4: the campus boundary polygon the geofence checks against (UC-5.EX.1, FR 3.8.1).
 *
 * NOT INVENTED. The real polygon has to be traced on a map by a teammate and saved as JSON, then pointed to with CAMPUS_BOUNDARY:
 *
 *     [ { "lat": 1.3, "lng": 103.6 }, { "lat": 1.3, "lng": 103.7 }, { "lat": 1.4, "lng": 103.7 }, ... ]     (3 or more points)
 *
 * (the numbers above are shape only). Until CAMPUS_BOUNDARY is set, `loadCampusBoundary` returns null and the geofence is OFF:
 * a journey is never cancelled because of a made-up polygon. docs/SETUP.md, step "Campus boundary", says how to trace it.
 * The grace margin and the number of consecutive readings are SRS Q12 (defaults: 200 m, 2).
 */
import { readFileSync } from 'node:fs';
import type { LatLng } from '../core/geo';
import { ConfigError } from './env';

/** Two readings in a row outside the boundary plus margin cancel the journey; one bad GPS fix never does (SRS Q12 default). */
export const GEOFENCE_CONSECUTIVE_READINGS = 2;

export function parseBoundary(json: unknown): LatLng[] {
  if (!Array.isArray(json) || json.length < 3) throw new Error('The campus boundary needs at least 3 points');
  return json.map((p, i) => {
    const lat = (p as LatLng)?.lat;
    const lng = (p as LatLng)?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      throw new Error(`Boundary point ${i + 1} is not a valid { lat, lng }`);
    return { lat, lng };
  });
}

/** Reads the file named by CAMPUS_BOUNDARY, or returns null when it is not set. A bad file stops the server with a clear message. */
export function loadCampusBoundary(path: string | undefined): LatLng[] | null {
  if (!path) return null;
  try {
    return parseBoundary(JSON.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    throw new ConfigError([{ name: 'CAMPUS_BOUNDARY', message: `cannot be used: ${err instanceof Error ? err.message : String(err)}` }]);
  }
}
