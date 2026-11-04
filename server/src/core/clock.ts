/**
 * Task K3: time as a dependency. Services and entities never call `new Date()`; they receive a Clock,
 * so a test can freeze or advance time (FakeClock) and the "2 trips a day", "3 minutes after ARRIVED"
 * and "30 seconds after completion" rules can be tested at their boundaries.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** A clock a test controls. Starts at a fixed, readable instant unless given another. */
export class FakeClock implements Clock {
  private current: number;

  constructor(start: Date | string = '2026-10-19T08:00:00.000Z') {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(to: Date | string): void {
    this.current = new Date(to).getTime();
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

export const seconds = (n: number): number => n * 1000;
export const minutes = (n: number): number => n * 60_000;

export const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);

/**
 * The Singapore calendar date (YYYY-MM-DD) of an instant. The "two paid trips a day" rule resets at
 * midnight Singapore time, whatever time zone the server runs in.
 */
export function sgDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
