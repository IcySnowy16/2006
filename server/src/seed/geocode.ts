/**
 * Task F6: fills in CANDIDATE coordinates with the Google Geocoding API, for a person to check.
 *
 * It never marks anything reviewed, never overwrites a coordinate that is already there, and drops any answer that is not in
 * Singapore (a wrong match must not become a pin). The output is a file for a human: open each place on a map, fix it if it is off,
 * then set "reviewed": true. The key comes from the environment and is never written to the file or printed.
 */
import type { CatalogFile } from './catalogFile';

export interface GeocodeOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  /** Pause between requests, so the free tier is not hammered. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  today?: string;
  log?: (line: string) => void;
}

interface GeocodeResponse {
  status: string;
  results?: { formatted_address: string; geometry: { location: { lat: number; lng: number }; location_type?: string } }[];
}

/** Singapore, loosely: a hit outside this box is a wrong match (another country's "Hall 4"), not a campus point. */
const SINGAPORE = { latMin: 1.15, latMax: 1.48, lngMin: 103.6, lngMax: 104.05 };
export const inSingapore = (lat: number, lng: number): boolean =>
  lat >= SINGAPORE.latMin && lat <= SINGAPORE.latMax && lng >= SINGAPORE.lngMin && lng <= SINGAPORE.lngMax;

export async function geocodeOne(query: string, o: GeocodeOptions): Promise<{ lat: number; lng: number; address: string } | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('region', 'sg');
  url.searchParams.set('key', o.apiKey);
  const res = await (o.fetchFn ?? fetch)(url);
  if (!res.ok) throw new Error(`Geocoding API answered HTTP ${res.status}`);
  const body = (await res.json()) as GeocodeResponse;
  if (body.status === 'ZERO_RESULTS') return null;
  if (body.status !== 'OK') throw new Error(`Geocoding API status ${body.status}`); // the message never contains the key
  const top = body.results?.[0];
  if (!top) return null;
  const { lat, lng } = top.geometry.location;
  return inSingapore(lat, lng) ? { lat, lng, address: top.formatted_address } : null;
}

export async function geocodeCatalog(catalog: CatalogFile, o: GeocodeOptions): Promise<{ catalog: CatalogFile; found: number; missed: string[] }> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => undefined);
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const out: CatalogFile = structuredClone(catalog);
  let found = 0;
  const missed: string[] = [];

  const fill = async (label: string, query: string, target: { lat: number | null; lng: number | null }, setSource?: (s: string) => void) => {
    if (target.lat !== null && target.lng !== null) return; // already there: never overwritten
    const hit = await geocodeOne(query, o);
    await sleep(o.delayMs ?? 150);
    if (!hit) {
      missed.push(label);
      log(`no usable answer: ${label}`);
      return;
    }
    target.lat = hit.lat;
    target.lng = hit.lng;
    setSource?.(`google-geocoding ${today}: ${hit.address}`);
    found += 1;
    log(`candidate: ${label}`);
  };

  for (const place of out.places) {
    await fill(place.name, `${place.name}, Nanyang Technological University, Singapore`, place, (s) => (place.source = s));
    for (const p of place.pickupPoints) {
      const kind = p.type === 'BUS_STOP' ? 'bus stop' : 'carpark';
      await fill(`${place.name} / ${p.name}`, `${p.name} ${kind}, Nanyang Technological University, Singapore`, p);
    }
    place.reviewed = false; // only a person sets this
  }
  return { catalog: out, found, missed };
}
