/**
 * Task K6: the job runner. `scheduleSweep(name, intervalMs, fn)` runs `fn` on a timer and
 *  - never overlaps itself: a tick is skipped while the last run is still going;
 *  - catches every error, logs it through `normalizeError`, and keeps running;
 *  - never lets an exception kill the process.
 * Each sweep must be idempotent (running twice in a row changes nothing the second time) and read deadlines stored on rows,
 * never in-memory timers, so a restart loses nothing (task D4).
 */
import type { Logger } from '../logging/types';
import { normalizeError } from '../middleware/errorHandler';

export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  setInterval: (fn, ms) => {
    const h = setInterval(fn, ms);
    h.unref(); // a sweep alone must not keep the process alive
    return h;
  },
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

export type SweepLogger = Pick<Logger, 'error'>;

export interface Sweep {
  readonly name: string;
  /** Run once now, unless the previous run is still going. Resolves when the run is over. */
  tick(): Promise<void>;
  stop(): void;
  readonly running: boolean;
  readonly runs: number;
  readonly failures: number;
}

export function scheduleSweep(
  name: string,
  intervalMs: number,
  fn: () => Promise<void> | void,
  logger?: SweepLogger,
  scheduler: Scheduler = realScheduler,
): Sweep {
  let running = false;
  let runs = 0;
  let failures = 0;

  const tick = async (): Promise<void> => {
    if (running) return; // never overlap
    running = true;
    runs += 1;
    try {
      await fn();
    } catch (err) {
      failures += 1;
      const n = normalizeError(err);
      logger?.error(
        { sweep: name, code: n.appError.code, err: { name: n.appError.name, message: n.appError.message, cause: String(n.original) } },
        'sweep failed',
      );
    } finally {
      running = false;
    }
  };

  const handle = scheduler.setInterval(() => void tick(), intervalMs);
  return {
    name,
    tick,
    stop: () => scheduler.clearInterval(handle),
    get running() {
      return running;
    },
    get runs() {
      return runs;
    },
    get failures() {
      return failures;
    },
  };
}
