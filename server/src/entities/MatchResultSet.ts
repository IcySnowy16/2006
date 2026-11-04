/**
 * Task F7b: the ranked answer to a hop request (not stored: it is recomputed when asked). The ranking Strategy interface
 * is declared here; the real ordering is implemented in MatchingService (B5b).
 */
export interface MatchCandidate {
  journeyId: string;
  driverId: string;
  driverName: string;
  driverAvgRating: number | null;
  driverUnpaidCount: number;
  pickupPointId: string;
  walkDistanceM: number;
  detourMin: number;
  pickupTime: Date;
  fareCents: number;
}

/** Negative when `a` should come before `b`. */
export interface RankingStrategy {
  compare(a: MatchCandidate, b: MatchCandidate): number;
}

export class MatchResultSet {
  constructor(private readonly candidates: readonly MatchCandidate[]) {}

  /** A new set, best first. The original order is kept for equal candidates. */
  rank(strategy: RankingStrategy): MatchResultSet {
    const indexed = this.candidates.map((c, i) => ({ c, i }));
    indexed.sort((x, y) => strategy.compare(x.c, y.c) || x.i - y.i);
    return new MatchResultSet(indexed.map((x) => x.c));
  }

  top(n: number): MatchCandidate[] {
    return this.candidates.slice(0, Math.max(0, n));
  }

  all(): MatchCandidate[] {
    return [...this.candidates];
  }

  get size(): number {
    return this.candidates.length;
  }
}
