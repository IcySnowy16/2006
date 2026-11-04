/**
 * Task K15: switches for features that can be cut without deleting code (Lab 4 manual section 2.5).
 * A flag is set by an environment variable FEATURE_<NAME_IN_CAPS>=true|false; without one the default applies.
 * A disabled feature must still exist in code and documents: only its UI and its endpoint are switched off.
 */
export const FEATURE_DEFAULTS = {
  /** A driver's preset fires by itself at its schedule time (FR 3.1.5). Tier 3, off. */
  scheduledGoLive: false,
  /** A passenger posts a request for later today (SRS Q8: same day only). */
  scheduledRequests: true,
  /** The booking service re-orders pickup points on SHARING trips (FR 4.11). Tier 3, off. */
  reorderPickups: false,
  /** The Call button and the phone number on the trip screens (UC-15 alternative flow AC.2). A privacy kill switch. */
  contactCall: true,
  /** Web Push. Off: the app falls back to the in-app list. */
  pushNotifications: false,
  /** Simulated withdrawal of a driver's earnings to PayNow (FR 10.12). Cadence and fees are still open (SRS Q5). */
  withdrawals: true,
  /** Booking when the wallet is a little short (75% of the fare and 3 rides, FR 10.3). Off: the whole fare must be in the wallet. To be added later. */
  bookOnTrust: false,
  /** The offline shell page of the PWA. */
  offlineShell: true,
  /**
   * A rider never pays more than the fare they last agreed to (vetting F2). When a co-rider cancels or is a no-show the fare can
   * still DROP but never rises back, so a rider with exactly the shared fare in the wallet is not pushed into debt and locked for
   * someone else's choice. This is how Grab (fixed upfront fares) and UberX Share (the discount is kept even without a match) price
   * shared rides. Off: SRS FR 5.1.3 as written (the riders left pay by the new, higher headcount fare).
   */
  fareLock: true,
} as const;

export type FeatureName = keyof typeof FEATURE_DEFAULTS;
export type FeatureFlags = Record<FeatureName, boolean>;

const toEnvName = (name: string) => 'FEATURE_' + name.replace(/([A-Z])/g, '_$1').toUpperCase();

/** Pure: reads the given environment, never process.env itself, so tests can pass their own. */
export function resolveFlags(env: Record<string, string | undefined> = {}): FeatureFlags {
  const out = { ...FEATURE_DEFAULTS } as FeatureFlags;
  for (const name of Object.keys(FEATURE_DEFAULTS) as FeatureName[]) {
    const raw = env[toEnvName(name)];
    if (raw === 'true' || raw === '1') out[name] = true;
    else if (raw === 'false' || raw === '0') out[name] = false;
  }
  return out;
}

export function featureEnvName(name: FeatureName): string {
  return toEnvName(name);
}
