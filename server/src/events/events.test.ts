import { describe, expect, it } from 'vitest';
import { EventBus, EventQueue } from './bus';
import { scheduleSweep, type Scheduler } from '../jobs/runner';

describe('K6: the event bus', () => {
  it('delivers a typed event to every listener, in order', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('AccountLocked', (p) => void seen.push(`a:${p.userId}`));
    bus.on('AccountLocked', async (p) => void seen.push(`b:${p.userId}`));
    await bus.emit('AccountLocked', { userId: 'u1' });
    expect(seen).toEqual(['a:u1', 'b:u1']);
  });

  it('a listener that throws is logged and does not stop the others or the caller', async () => {
    const logged: unknown[] = [];
    const bus = new EventBus({ error: (o) => logged.push(o) });
    const seen: string[] = [];
    bus.on('AccountUnlocked', () => {
      throw new Error('boom');
    });
    bus.on('AccountUnlocked', () => void seen.push('second'));
    await expect(bus.emit('AccountUnlocked', { userId: 'u1' })).resolves.toBeUndefined();
    expect(seen).toEqual(['second']);
    expect(JSON.stringify(logged)).toContain('boom');
  });

  it('events queued during a transaction are delivered only when the queue is published', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('TripStarted', (p) => void seen.push(p.journeyId));
    const q = new EventQueue();
    q.push('TripStarted', { journeyId: 'j1', driverId: 'd1', passengerIds: [] });
    q.push('TripStarted', { journeyId: 'j2', driverId: 'd1', passengerIds: [] });
    expect(seen).toEqual([]); // nothing yet: the transaction has not committed
    await bus.publish(q);
    expect(seen).toEqual(['j1', 'j2']);
    expect(q.size).toBe(0);
  });

  it('the unsubscribe function removes a listener', async () => {
    const bus = new EventBus();
    let n = 0;
    const off = bus.on('AccountLocked', () => void n++);
    await bus.emit('AccountLocked', { userId: 'u' });
    off();
    await bus.emit('AccountLocked', { userId: 'u' });
    expect(n).toBe(1);
  });
});

/** A scheduler the test drives by hand instead of waiting for real time. */
function manualScheduler() {
  const fns: (() => void)[] = [];
  const s: Scheduler & { fire(): void; cleared: boolean } = {
    cleared: false,
    setInterval: (fn) => {
      fns.push(fn);
      return fns.length;
    },
    clearInterval() {
      s.cleared = true;
    },
    fire: () => fns.forEach((f) => f()),
  };
  return s;
}

describe('K6: the job runner', () => {
  it('a sweep that throws once keeps running, and the error is logged', async () => {
    const errors: Record<string, unknown>[] = [];
    let calls = 0;
    const sweep = scheduleSweep(
      's',
      1000,
      () => {
        calls++;
        if (calls === 1) throw new Error('first run fails');
      },
      { error: (o) => errors.push(o) },
      manualScheduler(),
    );
    await sweep.tick();
    await sweep.tick();
    expect([sweep.runs, sweep.failures, calls]).toEqual([2, 1, 2]);
    expect(JSON.stringify(errors)).toContain('first run fails');
  });

  it('a slow sweep is not started twice', async () => {
    let release!: () => void;
    let started = 0;
    const sweep = scheduleSweep(
      'slow',
      1000,
      () => {
        started++;
        return new Promise<void>((r) => (release = r));
      },
      undefined,
      manualScheduler(),
    );
    const first = sweep.tick();
    expect(sweep.running).toBe(true);
    await sweep.tick(); // skipped: the first run is still going
    expect(started).toBe(1);
    release();
    await first;
    expect(sweep.running).toBe(false);
    const second = sweep.tick();
    expect(started).toBe(2);
    release();
    await second;
  });

  it('the timer fires the sweep, and stop clears it', async () => {
    const sched = manualScheduler();
    let n = 0;
    const sweep = scheduleSweep('t', 1000, () => void n++, undefined, sched);
    sched.fire();
    await new Promise((r) => setTimeout(r, 5));
    expect(n).toBe(1);
    sweep.stop();
    expect(sched.cleared).toBe(true);
  });

  it('an error that is not an Error object is still handled', async () => {
    const sweep = scheduleSweep('odd', 1000, () => Promise.reject('just a string'), { error: () => undefined }, manualScheduler());
    await expect(sweep.tick()).resolves.toBeUndefined();
    expect(sweep.failures).toBe(1);
  });
});
