/** Task D4: registers the timers. One `scheduleSweep` per job, so a failing one is logged and the others keep running. */
import type { AppContext } from '../context';
import { realScheduler, scheduleSweep, type Scheduler, type Sweep, type SweepLogger } from './runner';
import type { LocationService } from '../realtime/LocationService';
import { Sweeps } from './sweeps';

export * from './runner';
export { Sweeps } from './sweeps';

export interface JobSet {
  sweeps: Sweep[];
  stop(): void;
}

export function startJobs(ctx: AppContext, logger?: SweepLogger, scheduler: Scheduler = realScheduler, locations?: LocationService): JobSet {
  const jobs = new Sweeps(ctx, locations);
  const s = (name: string, everyMs: number, fn: () => Promise<unknown>) => scheduleSweep(name, everyMs, async () => void (await fn()), logger, scheduler);
  const sweeps = [
    s('expire-journeys', 60_000, () => jobs.expireJourneys()),
    s('decline-and-expire', 60_000, () => jobs.declineAndExpire()),
    s('no-show-window', 10_000, () => jobs.openNoShowWindows()),
    s('purge-sharing', 10_000, () => jobs.purgeSharing()),
    s('reset-daily-counters', 60_000, () => jobs.resetDailyCounters()),
    s('retry-pushes', 10_000, () => jobs.retryPushes()),
  ];
  return { sweeps, stop: () => sweeps.forEach((x) => x.stop()) };
}
