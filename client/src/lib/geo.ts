/** Small map helpers for the client. The route arrives as a Google encoded polyline (precision 5); decoding it is shared/src/polyline.ts. */
export interface Pt {
  lat: number;
  lng: number;
}

/** Fit points into a width x height box (y grows downwards), keeping the true aspect ratio. */
export function project(points: Pt[], extra: Pt[], width: number, height: number, pad = 18) {
  const all = [...points, ...extra];
  const minLat = Math.min(...all.map((p) => p.lat));
  const maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng));
  const maxLng = Math.max(...all.map((p) => p.lng));
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)); // a degree of longitude is shorter than one of latitude
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return (p: Pt) => ({ x: offX + (p.lng - minLng) * kx * scale, y: height - (offY + (p.lat - minLat) * scale) });
}

/** Great-circle distance in metres (haversine), for the rider's "driver is N m away". */
export function distanceM(a: Pt, b: Pt): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
