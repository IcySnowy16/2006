/**
 * Task B2: Google Directions API behind the MapsAdapter interface. Used ONCE per journey, at go-live (UC-6); matching
 * uses our own distance maths on the stored route and never calls Maps.
 *
 * The API key is read from the environment only and is never logged or sent to the client; the client gets the polyline.
 * Every failure (network, timeout, a status other than OK) is EXTERNAL_SERVICE_UNAVAILABLE (UC-6.EX.1). A 3-second budget
 * keeps go-live within NFR-1.2. OneMap is the documented fallback: write a second class with this interface.
 */
import { AppError } from '../../errors/AppError';
import { decodePolyline } from '@campus-hop/shared';
import type { LatLng } from '../../core/geo';
import type { DrivingRoute, MapsAdapter } from '../MapsAdapter';

export interface GoogleMapsSettings {
  apiKey: string;
  timeoutMs?: number;
  /** For tests: replace the network. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface DirectionsResponse {
  status: string;
  routes?: { overview_polyline?: { points?: string }; legs?: { duration?: { value?: number }; distance?: { value?: number } }[] }[];
}

export class GoogleMapsAdapter implements MapsAdapter {
  constructor(private readonly s: GoogleMapsSettings) {}

  async route(from: LatLng, to: LatLng, departAt: Date): Promise<DrivingRoute> {
    const departure = departAt.getTime() > Date.now() ? String(Math.floor(departAt.getTime() / 1000)) : 'now';
    const body = await this.call({ origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`, mode: 'driving', departure_time: departure });
    const route = body.routes?.[0];
    const leg = route?.legs?.[0];
    const polyline = route?.overview_polyline?.points;
    if (!polyline || leg?.duration?.value === undefined || leg.distance?.value === undefined) {
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { cause: new Error('Directions response had no route') });
    }
    return { polyline, points: decodePolyline(polyline), durationSec: leg.duration.value, distanceM: leg.distance.value };
  }

  async walkingDistance(a: LatLng, b: LatLng): Promise<number> {
    const body = await this.call({ origin: `${a.lat},${a.lng}`, destination: `${b.lat},${b.lng}`, mode: 'walking' });
    const metres = body.routes?.[0]?.legs?.[0]?.distance?.value;
    if (metres === undefined) throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { cause: new Error('Directions response had no distance') });
    return metres;
  }

  private async call(params: Record<string, string>): Promise<DirectionsResponse> {
    const url = new URL(this.s.baseUrl ?? 'https://maps.googleapis.com/maps/api/directions/json');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', this.s.apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.s.timeoutMs ?? 3000);
    try {
      const res = await (this.s.fetchImpl ?? fetch)(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Directions API answered HTTP ${res.status}`);
      const body = (await res.json()) as DirectionsResponse;
      if (body.status !== 'OK') throw new Error(`Directions API status ${body.status}`);
      return body;
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      // The message may contain the URL with the key: pass only a sanitised cause on.
      const text = cause instanceof Error ? cause.message.replace(/key=[^&\s]+/g, 'key=[REDACTED]') : 'unknown error';
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { cause: new Error(text) });
    } finally {
      clearTimeout(timer);
    }
  }
}
