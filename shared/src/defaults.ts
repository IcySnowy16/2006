/**
 * The DEFAULT answers to the open decisions: the 7 grill questions and the open questions in SRS Appendix C.
 * Nothing here has been decided by the team yet. Each value is the suggested answer, kept in ONE place so
 * that settling a question later means editing one line. `DECISIONS` also feeds docs/decisions-defaults.md.
 */

/** Constants the code reads. The source of each is in DECISIONS below. */
export const DEFAULTS = {
  // ---- SRS Q1, Q2, Q3, Q4 ------------------------------------------------------------------------
  EXIT_GATES: ['Main Gate', 'Pioneer Road North Gate', 'Jalan Bahar Gate'],
  SHARING_SEAT_CAP: 3,
  // ---- SRS Q5: simulated wallet ------------------------------------------------------------------
  FARE_SOLO_CENTS: 300,
  FARE_SHARED_CENTS: 200,
  TRUST_BALANCE_FRACTION: 0.75,
  TRUST_MIN_COMPLETED_RIDES: 3,
  WALLET_CAP_CENTS: 10_000, // $100: the most a wallet may hold; the top-up limit reads this too
  TOP_UP_MIN_CENTS: 100,
  /** Below this much available, the app warns that the next ride may not be bookable. */
  LOW_BALANCE_WARN_CENTS: 300,
  /** Below this much available (the cheapest fare), the passenger cannot request or book a ride until they top up. */
  MIN_BALANCE_TO_RIDE_CENTS: 200,
  TOP_UP_PRESETS_CENTS: [500, 1000, 2000, 5000, 10000], // $5, $10, $20, $50, $100: fixed amounts only for now
  // ---- trips and matching ------------------------------------------------------------------------
  MAX_PAID_TRIPS_PER_DAY: 2,
  NO_SHOW_WAIT_MIN: 3,
  APPROACHING_M: 300,
  /** Inside this distance of the pickup point the driver counts as ARRIVED (FR 7.8). */
  ARRIVED_M: 30,
  MATCH_TIME_TOLERANCE_MIN: 15, // SRS Q8
  MAX_WALK_M: 400,
  AVG_SPEED_KMH: 20,
  MAX_PRESETS_PER_DRIVER: 5,
  // ---- live location -----------------------------------------------------------------------------
  LOCATION_STALE_S: 15,
  LOW_ACCURACY_M: 50,
  LOCATION_MIN_INTERVAL_MS: 1000,
  // ---- SRS Q17 ---------------------------------------------------------------------------------
  CONTACT_WINDOW_MIN: 30,
  // ---- accounts ----------------------------------------------------------------------------------
  CODE_TTL_MIN: 10,
  CODE_MAX_ATTEMPTS: 3,
  SESSION_DAYS: 7,
  UNVERIFIED_ACCOUNT_DAYS: 7,
} as const;

export interface Decision {
  /** Where the question is asked: "Grill Q3", "SRS Q7". */
  source: string;
  question: string;
  /** The default that the code uses. */
  answer: string;
  /** Where in the code it is applied, so a reviewer can find it. */
  appliedIn: string;
}

export const DECISIONS: readonly Decision[] = [
  {
    source: 'Grill Q1',
    question: 'Where does the code live?',
    answer: 'Keep one repo for code, lab files, commits and issues.',
    appliedIn: 'repository layout (README.md)',
  },
  {
    source: 'Grill Q2',
    question: 'Who may merge to dev?',
    answer: 'One teammate who did not write or prompt the code.',
    appliedIn: 'CONTRIBUTING.md, .github/CODEOWNERS',
  },
  {
    source: 'Grill Q3',
    question: 'Where is it hosted for the demo?',
    answer: 'One free host that runs Node and Postgres, chosen later; everything is configured by environment variables.',
    appliedIn: 'server/src/config/env.ts, Dockerfile, docs/SETUP.md',
  },
  {
    source: 'Grill Q4',
    question: 'Where does the list of error codes live?',
    answer: 'In shared; the server imports it.',
    appliedIn: 'shared/src/errors.ts, server/src/errors/AppError.ts',
  },
  {
    source: 'Grill Q5',
    question: 'Which phone formats are accepted?',
    answer: 'Spaces, dashes, dots and brackets are stripped; 8 to 15 digits, optional +.',
    appliedIn: 'shared/src/endpoints/account.ts (Phone)',
  },
  {
    source: 'Grill Q6',
    question: 'Who approves the endpoint table?',
    answer: 'The whole team reads it once; one person signs it off.',
    appliedIn: 'docs/endpoints.md (generated from shared/src/api.ts)',
  },
  { source: 'Grill Q7', question: 'CI before more code?', answer: 'Yes: GitHub Actions now.', appliedIn: '.github/workflows/ci.yml' },
  {
    source: 'SRS Q1',
    question: 'Two exits or three? May a preset end on campus?',
    answer: 'Three gates (Main, Pioneer Road North, Jalan Bahar), exits only.',
    appliedIn: 'DEFAULTS.EXIT_GATES, PresetService',
  },
  {
    source: 'SRS Q2',
    question: 'Is the "journey I would make anyway" declaration per preset or per trip?',
    answer: 'Once per preset, shown again at go-live.',
    appliedIn: 'PresetService, GoLive screen',
  },
  {
    source: 'SRS Q3',
    question: 'Both matching modes in v1?',
    answer: 'Both: driver cards and passenger requests.',
    appliedIn: 'MatchingService, HopRequestService',
  },
  { source: 'SRS Q4', question: 'SHARING cap: 3 or the car seats?', answer: 'Fixed at 3.', appliedIn: 'DEFAULTS.SHARING_SEAT_CAP' },
  {
    source: 'SRS Q5',
    question: 'Payment option and thresholds?',
    answer:
      'Simulated wallet; $100 cap; fixed top-up amounts; a ride needs the whole fare in the wallet (the 75% and 3 rides "on trust" rule is switched off); warning under $3, no new request or booking under $2; no fee; top-up allowed during a ride.',
    appliedIn: 'WalletService, FareService, AccountService',
  },
  { source: 'SRS Q6', question: 'What does LOCKED block?', answer: 'Both requesting and booking.', appliedIn: 'requireUnlocked middleware' },
  { source: 'SRS Q7', question: 'How long does a LIVE journey wait?', answer: '15 minutes.', appliedIn: 'config LIVE_WINDOW_MIN, expiry job' },
  {
    source: 'SRS Q8',
    question: 'Scheduling window and time tolerance?',
    answer: 'Same day only; plus or minus 15 minutes.',
    appliedIn: 'HopRequestService, MatchingService',
  },
  {
    source: 'SRS Q9',
    question: "Does a rider's fare drop when another joins?",
    answer: 'Yes, to the shared fare, with a notification.',
    appliedIn: 'FareService.retier',
  },
  { source: 'SRS Q10', question: 'Live location before pickup?', answer: 'Only once the trip is in progress.', appliedIn: 'realtime join check' },
  {
    source: 'SRS Q12',
    question: 'Geofence parameters?',
    answer: '200 m margin and two consecutive readings; applies to LIVE, OPEN and FULL.',
    appliedIn: 'GeofenceService, config GEOFENCE_GRACE_M',
  },
  {
    source: 'SRS Q13',
    question: 'Location stop: 30 s or dismiss?',
    answer: '30 seconds after completion.',
    appliedIn: 'config SHARING_STOP_SECONDS, stop-sharing job',
  },
  { source: 'SRS Q14', question: 'Realtime transport?', answer: 'WebSocket (Socket.IO).', appliedIn: 'server/src/realtime' },
  { source: 'SRS Q16', question: 'Passenger presets?', answer: 'No.', appliedIn: 'schema has DriverPreset only' },
  { source: 'SRS Q17', question: 'Contact window after a trip ends?', answer: '30 minutes.', appliedIn: 'DEFAULTS.CONTACT_WINDOW_MIN, TripService.getContact' },
];
