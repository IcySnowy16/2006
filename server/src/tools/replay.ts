/**
 * Task K7 / Q5: the replay-GPS tool. Nobody has to walk outside to test the tracking screens: this signs in as the driver, finds the
 * journey that is in progress, takes its stored route, and sends one position after another over the same Socket.IO channel a phone
 * would use. The server cannot tell the difference (and still checks that the sender is the journey's driver).
 *
 *   npm run replay-gps -- --email demo.driver@e.ntu.edu.sg --password demo-password-1 --url http://localhost:3000
 */
import { io } from 'socket.io-client';
import { decodePolyline, type Position } from '@campus-hop/shared';
import { ReplayGpsSource } from '../adapters/GpsSource';
import { haversineM, type LatLng } from '../core/geo';

/** Insert points so no two are more than `stepM` metres apart (a straight route of 2 points becomes a walkable path). */
export function densify(points: readonly LatLng[], stepM: number): LatLng[] {
  if (points.length < 2) return [...points];
  const out: LatLng[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const pieces = Math.max(1, Math.ceil(haversineM(a, b) / stepM));
    for (let k = 1; k <= pieces; k++) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / pieces, lng: a.lng + ((b.lng - a.lng) * k) / pieces });
  }
  return out;
}

export interface ReplayOptions {
  baseUrl: string;
  email: string;
  password: string;
  /** Default: the driver's journey that is IN_PROGRESS. */
  journeyId?: string;
  /** A recorded path instead of the stored route. */
  path?: LatLng[];
  stepM?: number;
  intervalMs?: number;
  accuracyM?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface ReplayResult {
  journeyId: string;
  sent: number;
  accepted: number;
}

async function api<T>(baseUrl: string, path: string, cookie: string, init: RequestInit = {}): Promise<{ status: number; body: T; cookie?: string }> {
  const res = await fetch(new URL(path, baseUrl), { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } });
  const set = res.headers.getSetCookie?.()[0]?.split(';')[0];
  return { status: res.status, body: (await res.json().catch(() => null)) as T, cookie: set };
}

export async function runReplay(o: ReplayOptions): Promise<ReplayResult> {
  const log = o.log ?? (() => undefined);
  const login = await api<{ message?: string }>(o.baseUrl, '/api/auth/login', '', {
    method: 'POST',
    body: JSON.stringify({ ntuEmail: o.email, password: o.password }),
  });
  if (login.status !== 200 || !login.cookie) throw new Error(`Login failed (${login.status}): ${login.body?.message ?? 'no cookie'}`);
  log(`signed in as ${o.email}`);

  const mine = await api<{ id: string; status: string; route: { polyline: string } | null }[]>(o.baseUrl, '/api/journeys/mine', login.cookie);
  const journey = mine.body.find((j) => (o.journeyId ? j.id === o.journeyId : j.status === 'IN_PROGRESS'));
  if (!journey)
    throw new Error(
      o.journeyId ? `No journey ${o.journeyId} among yours.` : 'No journey is IN_PROGRESS. Start the trip in the app first, then run this again.',
    );
  const route = o.path ?? (journey.route ? decodePolyline(journey.route.polyline) : []);
  if (route.length < 2) throw new Error('The journey has no route to follow.');
  const path = densify(route, o.stepM ?? 25);
  log(`journey ${journey.id}: ${path.length} positions`);

  const socket = io(o.baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { cookie: login.cookie } });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(new Error(`Socket refused: ${e.message}`)));
    });
    const joined = (await socket.emitWithAck('journey:join', { journeyId: journey.id })) as { ok: boolean; code?: string; message?: string };
    if (!joined.ok) throw new Error(`Cannot join the journey room: ${joined.code} ${joined.message ?? ''}`);

    const source = new ReplayGpsSource(
      path.map((p) => ({ ...p, accuracyM: o.accuracyM ?? 8 })),
      o.intervalMs ?? 2000,
      undefined,
      o.sleep,
    );
    let sent = 0;
    let accepted = 0;
    for await (const position of source.positions() as AsyncIterable<Position>) {
      const ack = (await socket.emitWithAck('location:update', { journeyId: journey.id, position })) as { ok: boolean; code?: string };
      sent += 1;
      if (ack.ok) accepted += 1;
      else if (ack.code === 'TRIP_NOT_ACTIVE') {
        log('the trip is no longer active; stopping');
        break;
      }
      log(`${sent}/${path.length} ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
    }
    return { journeyId: journey.id, sent, accepted };
  } finally {
    socket.close();
  }
}
