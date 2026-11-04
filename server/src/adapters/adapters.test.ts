import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/AppError';
import { decodePolyline, encodePolyline } from '@campus-hop/shared';
import { parseEnv } from '../config/env';
import { createAdapters, createFakeAdapters } from './index';
import { FakeMapsAdapter, InMemoryEmailAdapter, InMemoryPayNowAdapter, InMemoryPushAdapter } from './fakes';
import { SimulatedPayNowAdapter } from './PayNowAdapter';
import { ReplayGpsSource } from './GpsSource';
import { LoggingPushAdapter } from './PushAdapter';
import { SmtpEmailAdapter } from './email/SmtpEmailAdapter';
import { verificationEmail } from './email/templates';
import { GoogleMapsAdapter } from './maps/GoogleMapsAdapter';

const code = async (fn: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await fn();
  } catch (e) {
    return e instanceof AppError ? e.code : `NOT_APPERROR:${(e as Error).message}`;
  }
  return undefined;
};

const A = { lat: 1.0, lng: 103.0 };
const B = { lat: 1.006, lng: 103.0 };

describe('K5: the fakes record calls and can be told to fail', () => {
  it('email: records the message, finds the code, and failNext throws EXTERNAL_SERVICE_UNAVAILABLE once', async () => {
    const e = new InMemoryEmailAdapter();
    await e.send({ to: 'a@e.ntu.edu.sg', subject: 's', body: 'Your Campus Hop code is 123456; it expires in 10 minutes.' });
    expect(e.sent).toHaveLength(1);
    expect(e.lastCodeFor('a@e.ntu.edu.sg')).toBe('123456');
    expect(e.lastTo('nobody@e.ntu.edu.sg')).toBeUndefined();
    e.failNext();
    expect(await code(() => e.send({ to: 'a', subject: 's', body: 'b' }))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
    await e.send({ to: 'a', subject: 's', body: 'b' }); // only the next call failed
    expect(e.sent).toHaveLength(2);
  });

  it('maps: a straight route with a midpoint; failNext(2) fails twice', async () => {
    const m = new FakeMapsAdapter();
    const r = await m.route(A, B, new Date());
    expect(r.points).toHaveLength(3);
    expect(r.distanceM).toBeGreaterThan(600);
    expect(decodePolyline(r.polyline)[0]).toEqual(A);
    expect(m.routeCalls).toHaveLength(1);
    m.failNext(2);
    expect(await code(() => m.route(A, B, new Date()))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
    expect(await code(() => m.walkingDistance(A, B))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
    expect(await m.walkingDistance(A, B)).toBeGreaterThan(600);
  });

  it('paynow and push: record and fail on request', async () => {
    const p = new InMemoryPayNowAdapter();
    expect((await p.simulateTopUp('u1', 500)).simulated).toBe(true);
    await p.simulatePayout('u1', 200);
    expect([p.topUps.length, p.payouts.length]).toEqual([1, 1]);
    p.failNext();
    expect(await code(() => p.simulateTopUp('u1', 1))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
    const push = new InMemoryPushAdapter();
    await push.send('u1', { title: 't', body: 'b' });
    expect(push.sent[0]?.userId).toBe('u1');
    push.failNext();
    expect(await code(() => push.send('u1', { title: 't', body: 'b' }))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
  });

  it('the simulated PayNow only returns a reference', async () => {
    const r = await new SimulatedPayNowAdapter().simulateTopUp('u1', 500);
    expect(r).toMatchObject({ simulated: true });
    expect(r.reference).toMatch(/^SIM-TOPUP-/);
  });

  it('LoggingPushAdapter logs the user and title, not the text', async () => {
    const lines: Record<string, unknown>[] = [];
    await new LoggingPushAdapter({ debug: (o) => lines.push(o) }).send('u1', { title: 'Trip started', body: 'secret text' });
    expect(JSON.stringify(lines)).toContain('u1');
    expect(JSON.stringify(lines)).not.toContain('secret text');
  });

  it('ReplayGpsSource plays a path in order and can be stopped', async () => {
    const times: number[] = [];
    const src = new ReplayGpsSource(
      [A, B, A],
      5000,
      () => new Date('2026-10-19T08:00:00Z'),
      async (ms) => void times.push(ms),
    );
    const seen: number[] = [];
    for await (const p of src.positions()) {
      seen.push(p.lat);
      if (seen.length === 2) src.stop();
    }
    expect(seen).toEqual([1.0, 1.006]);
    expect(times).toEqual([5000, 5000]);
  });
});

describe('K5: createAdapters', () => {
  const env = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db', JWT_SECRET: 'a-test-secret-that-is-at-least-32-characters-long' };
  const logger = { warn: () => undefined, debug: () => undefined };

  it('NODE_ENV=test gives the fakes, so nothing real is ever called', () => {
    const a = createAdapters(parseEnv({ ...env, NODE_ENV: 'test' }), logger);
    expect(a.email).toBeInstanceOf(InMemoryEmailAdapter);
    expect(a.maps).toBeInstanceOf(FakeMapsAdapter);
  });

  it('development: SMTP e-mail, the fake Maps when there is no key, Google Maps when there is one', () => {
    const noKey = createAdapters(parseEnv(env), logger);
    expect(noKey.email).toBeInstanceOf(SmtpEmailAdapter);
    expect(noKey.maps).toBeInstanceOf(FakeMapsAdapter);
    const withKey = createAdapters(parseEnv({ ...env, GOOGLE_MAPS_API_KEY: 'k' }), logger);
    expect(withKey.maps).toBeInstanceOf(GoogleMapsAdapter);
  });

  it('createFakeAdapters returns one of each', () => {
    expect(Object.keys(createFakeAdapters()).sort()).toEqual(['email', 'maps', 'payNow', 'push']);
  });
});

describe('A1: the verification e-mail and the SMTP adapter', () => {
  it('the text carries the code and the lifetime, in plain text', () => {
    const m = verificationEmail('482913', 10);
    expect(m.body).toContain('482913');
    expect(m.body).toContain('10 minutes');
    expect(m.subject).toMatch(/Campus Hop/);
  });

  it('SMTP down: EXTERNAL_SERVICE_UNAVAILABLE, and the log never contains the code', async () => {
    const warned: Record<string, unknown>[] = [];
    const smtp = new SmtpEmailAdapter({ host: '127.0.0.1', port: 1, from: 'Campus Hop <x@y.z>', timeoutMs: 800 }, { warn: (o) => warned.push(o) });
    expect(await code(() => smtp.send({ to: 'a@e.ntu.edu.sg', subject: 's', body: 'Your code is 482913' }))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
    expect(JSON.stringify(warned)).toContain('a@e.ntu.edu.sg');
    expect(JSON.stringify(warned)).not.toContain('482913');
  });
});

describe('B2: GoogleMapsAdapter with recorded responses', () => {
  const poly = encodePolyline([A, { lat: 1.003, lng: 103.001 }, B]);
  const ok = { status: 'OK', routes: [{ overview_polyline: { points: poly }, legs: [{ duration: { value: 240 }, distance: { value: 1100 } }] }] };
  const respond = (body: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('turns a Directions response into a route', async () => {
    const urls: string[] = [];
    const g = new GoogleMapsAdapter({
      apiKey: 'SECRET-KEY',
      fetchImpl: (async (u: URL) => {
        urls.push(String(u));
        return new Response(JSON.stringify(ok));
      }) as unknown as typeof fetch,
    });
    const r = await g.route(A, B, new Date('2020-01-01'));
    expect(r).toMatchObject({ polyline: poly, durationSec: 240, distanceM: 1100 });
    expect(r.points).toHaveLength(3);
    expect(urls[0]).toContain('mode=driving');
    expect(urls[0]).toContain('departure_time=now'); // a time in the past means "now"
    expect(await new GoogleMapsAdapter({ apiKey: 'k', fetchImpl: respond(ok) }).walkingDistance(A, B)).toBe(1100);
  });

  it('every kind of failure is EXTERNAL_SERVICE_UNAVAILABLE', async () => {
    const down = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    for (const f of [respond({ status: 'ZERO_RESULTS' }), respond({ status: 'OK', routes: [] }), respond({}, 500), down]) {
      expect(await code(() => new GoogleMapsAdapter({ apiKey: 'k', fetchImpl: f }).route(A, B, new Date()))).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
    }
  });

  it('gives up after the time budget', async () => {
    const hang = ((_u: URL, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const started = Date.now();
    expect(await code(() => new GoogleMapsAdapter({ apiKey: 'k', timeoutMs: 50, fetchImpl: hang }).route(A, B, new Date()))).toBe(
      'EXTERNAL_SERVICE_UNAVAILABLE',
    );
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('the API key never appears in the error that gets logged', async () => {
    const leaky = (async (u: URL) => {
      throw new Error(`request to ${u} failed`);
    }) as unknown as typeof fetch;
    let caught: AppError | undefined;
    try {
      await new GoogleMapsAdapter({ apiKey: 'SECRET-KEY', fetchImpl: leaky }).route(A, B, new Date());
    } catch (e) {
      caught = e as AppError;
    }
    expect(caught).toBeDefined();
    const text = JSON.stringify({ message: caught!.message, cause: String(caught!.cause) });
    expect(text).not.toContain('SECRET-KEY');
    expect(text).toContain('[REDACTED]');
  });
});
