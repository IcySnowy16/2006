/** Task K5 / K7: where driver positions come from when no real phone is involved (the replay tool and tests). */
import type { Position } from '@campus-hop/shared';

export interface GpsSource {
  /** Yields positions until the source runs out or `stop()` is called. */
  positions(): AsyncIterable<Position>;
  stop(): void;
}

/** Plays a recorded path, one point per `intervalMs`, with timestamps from the supplied clock function. */
export class ReplayGpsSource implements GpsSource {
  private stopped = false;

  constructor(
    private readonly path: readonly { lat: number; lng: number; accuracyM?: number }[],
    private readonly intervalMs: number,
    private readonly now: () => Date = () => new Date(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async *positions(): AsyncIterable<Position> {
    for (const p of this.path) {
      if (this.stopped) return;
      yield { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? 8, ts: this.now().toISOString() };
      await this.sleep(this.intervalMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
