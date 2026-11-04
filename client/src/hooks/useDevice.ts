/** Tasks B7, D5, Q4: the phone's location and screen wake lock. Each tolerates the browser saying no, and says so plainly. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Position } from '@campus-hop/shared';

export type GeoResult = { ok: true; position: Position } | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' };

const toPosition = (p: GeolocationPosition): Position => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
  ts: new Date(p.timestamp).toISOString(),
});

/** One fix, asking permission if needed. FR 3.9 / 7.11: the server also refuses without it. */
export function getFix(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ ok: false, reason: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, position: toPosition(p) }),
      (e) => resolve({ ok: false, reason: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  });
}

export const geoProblem = (r: Extract<GeoResult, { ok: false }>): string =>
  r.reason === 'denied'
    ? 'Location access is blocked. Allow it for this site in your browser settings, then try again.'
    : r.reason === 'timeout'
      ? 'Your phone could not find its location in time. Move to an open area and try again.'
      : 'Location is not available on this device.';

/** Calls `onPosition` about every `everyMs` while `active`; used before the trip (geofence) and during it (live location). */
export function useLocationReporter(active: boolean, everyMs: number, onPosition: (p: Position) => void): { lastFix: Position | null; problem: string | null } {
  const [lastFix, setLastFix] = useState<Position | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const cb = useRef(onPosition);
  cb.current = onPosition;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let asking = false; // one request at a time: with weak GPS a 15 s request must not overlap the next tick and arrive out of order
    const tick = async () => {
      if (asking) return;
      asking = true;
      const r = await getFix().finally(() => (asking = false));
      if (stopped) return;
      if (r.ok) {
        setLastFix(r.position);
        setProblem(null);
        cb.current(r.position);
      } else setProblem(geoProblem(r));
    };
    void tick();
    const id = setInterval(() => void tick(), everyMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, everyMs]);
  return { lastFix, problem };
}

/** Keeps the screen on during a trip (Plan risk 10); re-asks when the page becomes visible again. Rejection is fine. */
export function useWakeLock(active: boolean): { held: boolean } {
  const [held, setHeld] = useState(false);
  const lock = useRef<WakeLockSentinel | null>(null);
  const wanted = useRef(false);
  const request = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        const sentinel = await navigator.wakeLock.request('screen');
        // The screen may have been left while the browser was still deciding: give the lock straight back.
        if (!wanted.current) return void sentinel.release().catch(() => undefined);
        lock.current = sentinel;
        setHeld(true);
        sentinel.addEventListener('release', () => setHeld(false));
      }
    } catch {
      setHeld(false);
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    wanted.current = true;
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      wanted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock.current?.release().catch(() => undefined);
      lock.current = null;
    };
  }, [active, request]);
  return { held };
}
