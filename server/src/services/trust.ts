/**
 * Task C4: the ONE function that decides ENOUGH / ON_TRUST / NOT_ENOUGH (FR 10.2 to 10.4). Both the booking preview and the
 * booking itself call it, so the two can never disagree. Integer arithmetic only: "75%" is `available * 4 >= fare * 3`.
 *
 * Thresholds come from DEFAULTS (SRS Q5 default: 75% of the fare, 3 completed rides). If the team changes them, edit
 * shared/src/defaults.ts; nothing else moves.
 *
 * `allowTrust` is the `bookOnTrust` feature flag. It is OFF for now: the whole fare must be in the wallet, so the answer is only
 * ENOUGH or NOT_ENOUGH. The 75% branch stays in the code so switching the flag on later needs no change here.
 */
import { DEFAULTS, type BalanceCheck } from '@campus-hop/shared';

// 0.75 as a fraction of whole numbers, so no float is ever multiplied with money.
const DENOMINATOR = 100;
const NUMERATOR = Math.round(DEFAULTS.TRUST_BALANCE_FRACTION * DENOMINATOR);

export function trustDecision(availableCents: number, completedRides: number, fareCents: number, allowTrust: boolean): BalanceCheck {
  if (availableCents >= fareCents) return 'ENOUGH';
  if (!allowTrust) return 'NOT_ENOUGH';
  const meetsFraction = availableCents * DENOMINATOR >= fareCents * NUMERATOR;
  if (meetsFraction && completedRides >= DEFAULTS.TRUST_MIN_COMPLETED_RIDES) return 'ON_TRUST';
  return 'NOT_ENOUGH';
}
