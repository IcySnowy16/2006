# Decisions that are still open, and the default each one uses

Generated from `shared/src/defaults.ts` (`npm run docs`). **Nothing here has been decided by the team.** Each row is the suggested answer, applied so the code could be written; to settle a question, change the one value in `shared/src/defaults.ts` (or the setting named in the last column) and run `npm run docs`.

| Source | Question | Default used | Where it is applied |
|---|---|---|---|
| Grill Q1 | Where does the code live? | Keep one repo for code, lab files, commits and issues. | repository layout (README.md) |
| Grill Q2 | Who may merge to dev? | One teammate who did not write or prompt the code. | CONTRIBUTING.md, .github/CODEOWNERS |
| Grill Q3 | Where is it hosted for the demo? | One free host that runs Node and Postgres, chosen later; everything is configured by environment variables. | server/src/config/env.ts, Dockerfile, docs/SETUP.md |
| Grill Q4 | Where does the list of error codes live? | In shared; the server imports it. | shared/src/errors.ts, server/src/errors/AppError.ts |
| Grill Q5 | Which phone formats are accepted? | Spaces, dashes, dots and brackets are stripped; 8 to 15 digits, optional +. | shared/src/endpoints/account.ts (Phone) |
| Grill Q6 | Who approves the endpoint table? | The whole team reads it once; one person signs it off. | docs/endpoints.md (generated from shared/src/api.ts) |
| Grill Q7 | CI before more code? | Yes: GitHub Actions now. | .github/workflows/ci.yml |
| SRS Q1 | Two exits or three? May a preset end on campus? | Three gates (Main, Pioneer Road North, Jalan Bahar), exits only. | DEFAULTS.EXIT_GATES, PresetService |
| SRS Q2 | Is the "journey I would make anyway" declaration per preset or per trip? | Once per preset, shown again at go-live. | PresetService, GoLive screen |
| SRS Q3 | Both matching modes in v1? | Both: driver cards and passenger requests. | MatchingService, HopRequestService |
| SRS Q4 | SHARING cap: 3 or the car seats? | Fixed at 3. | DEFAULTS.SHARING_SEAT_CAP |
| SRS Q5 | Payment option and thresholds? | Simulated wallet; $100 cap; fixed top-up amounts; a ride needs the whole fare in the wallet (the 75% and 3 rides "on trust" rule is switched off); warning under $3, no new request or booking under $2; no fee; top-up allowed during a ride. | WalletService, FareService, AccountService |
| SRS Q6 | What does LOCKED block? | Both requesting and booking. | requireUnlocked middleware |
| SRS Q7 | How long does a LIVE journey wait? | 15 minutes. | config LIVE_WINDOW_MIN, expiry job |
| SRS Q8 | Scheduling window and time tolerance? | Same day only; plus or minus 15 minutes. | HopRequestService, MatchingService |
| SRS Q9 | Does a rider's fare drop when another joins? | Yes, to the shared fare, with a notification. | FareService.retier |
| SRS Q10 | Live location before pickup? | Only once the trip is in progress. | realtime join check |
| SRS Q12 | Geofence parameters? | 200 m margin and two consecutive readings; applies to LIVE, OPEN and FULL. | GeofenceService, config GEOFENCE_GRACE_M |
| SRS Q13 | Location stop: 30 s or dismiss? | 30 seconds after completion. | config SHARING_STOP_SECONDS, stop-sharing job |
| SRS Q14 | Realtime transport? | WebSocket (Socket.IO). | server/src/realtime |
| SRS Q16 | Passenger presets? | No. | schema has DriverPreset only |
| SRS Q17 | Contact window after a trip ends? | 30 minutes. | DEFAULTS.CONTACT_WINDOW_MIN, TripService.getContact |
