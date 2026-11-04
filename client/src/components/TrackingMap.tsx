/**
 * Tasks D5, D6: a schematic map drawn from the driver's stored route and live position: no tiles, no key, no network. It shows the
 * shape of the trip and where the car is; a real map layer is a possible later step (docs/SETUP.md). A stale or inaccurate fix is
 * flagged (FR 7.9: older than 15 s, or worse than 50 m).
 */
import { useEffect, useState } from 'react';
import { DEFAULTS, decodePolyline, type Position } from '@campus-hop/shared';
import { project } from '../lib/geo';

/** A bad polyline must not crash the screen: show the map without the route line. */
function decodeOrEmpty(polyline: string) {
  try {
    return decodePolyline(polyline);
  } catch {
    return [];
  }
}

const W = 360;
const H = 220;

export function TrackingMap({ polyline, position, receivedAt }: { polyline: string | null; position: Position | null; receivedAt?: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const route = polyline ? decodeOrEmpty(polyline) : [];
  const driver = position ? { lat: position.lat, lng: position.lng } : null;
  if (route.length < 2 && !driver) return <div className="map map-empty">The route will appear when the trip starts.</div>;

  const to = project(route, driver ? [driver] : [], W, H);
  const path = route
    .map((p) => to(p))
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const car = driver ? to(driver) : null;
  const ageS = position ? Math.max(0, Math.round((now - (receivedAt ?? new Date(position.ts).getTime())) / 1000)) : null;
  const stale = ageS !== null && ageS > DEFAULTS.LOCATION_STALE_S;
  const rough = position !== null && position.accuracyM > DEFAULTS.LOW_ACCURACY_M;
  const start = route[0] ? to(route[0]) : null;
  const end = route.length ? to(route[route.length - 1]!) : null;

  return (
    <figure className="map-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={car ? 'Map of the route with the car position' : 'Map of the route'} className="map">
        <rect width={W} height={H} rx="12" className="map-bg" />
        {path && <path d={path} className="map-route" />}
        {start && <circle cx={start.x} cy={start.y} r="6" className="map-start" />}
        {end && <rect x={end.x - 6} y={end.y - 6} width="12" height="12" className="map-end" />}
        {car && (
          <g className={stale ? 'map-car stale' : 'map-car'}>
            <circle cx={car.x} cy={car.y} r="14" className="map-car-halo" />
            <circle cx={car.x} cy={car.y} r="7" className="map-car-dot" />
          </g>
        )}
      </svg>
      <figcaption className="muted small">
        {position === null
          ? 'Waiting for the driver’s position…'
          : stale
            ? `Last position ${ageS} s ago: the signal may be weak.`
            : rough
              ? 'Position is approximate (low GPS accuracy).'
              : 'Live position'}
      </figcaption>
    </figure>
  );
}
