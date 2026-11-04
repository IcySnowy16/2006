/**
 * Task K3 / B2 / B4 / B5b: the small amount of geometry the app needs. Our own maths on the stored route (matching
 * does not call Maps). Distances are metres. Over a campus-sized area an equirectangular projection is accurate to
 * well under a metre, so it is used for point-to-line work; haversine for point-to-point.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Project to local metres around `origin` (x east, y north). */
function toXY(p: LatLng, origin: LatLng): { x: number; y: number } {
  return { x: rad(p.lng - origin.lng) * R * Math.cos(rad(origin.lat)), y: rad(p.lat - origin.lat) * R };
}

/** Shortest distance in metres from a point to the segment a-b. */
export function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const P = toXY(p, a);
  const B = toXY(b, a);
  const len2 = B.x * B.x + B.y * B.y;
  if (len2 === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
  return Math.hypot(P.x - t * B.x, P.y - t * B.y);
}

/** Shortest distance in metres from a point to a polyline (at least one point). */
export function distanceToPolylineM(p: LatLng, line: readonly LatLng[]): number {
  if (line.length === 0) throw new RangeError('A route needs at least one point');
  if (line.length === 1) return haversineM(p, line[0]!);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distanceToSegmentM(p, line[i]!, line[i + 1]!));
  return best;
}

/** Ray casting. `polygon` is a ring of points (the closing point may be omitted). */
export function pointInPolygon(p: LatLng, polygon: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses = a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from a point to the edge of a polygon (0 if exactly on it). */
export function distanceToPolygonEdgeM(p: LatLng, polygon: readonly LatLng[]): number {
  const ring = [...polygon, polygon[0]!];
  return distanceToPolylineM(p, ring);
}

/** Detour for a pickup point: out to the route and back, at an average speed (SRS FR 4.4.1; default 20 km/h on campus). */
export function detourMinutes(distanceToRouteM: number, avgSpeedKmh: number): number {
  const metresPerMin = (avgSpeedKmh * 1000) / 60;
  return (2 * distanceToRouteM) / metresPerMin;
}
