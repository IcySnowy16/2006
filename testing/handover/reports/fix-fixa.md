# fix-fixa: B-NA-001 (go-live race) and C-014 (past pick-up times)

- Branch: `worktree-agent-a1c48d4d6fa03a51a`. Worktree: `/home/user/2006/.claude/worktrees/agent-a1c48d4d6fa03a51a`. Not pushed.
- Commits on top of 1ec4320:
  - `0b41926` [B-NA-001] Go live: re-check the guards under a row lock on the driver
  - `3e7e131` [C-014] Match cards never offer a pick-up time in the past
- Setup note: the worktree started at d905a13, an older commit that is an ancestor of 1ec4320. I moved the worktree branch to 1ec4320 (`git reset --hard`, the tree was clean) so the work sits on the base the brief names.

## 1. B-NA-001 / G5: simultaneous go-lives

**Root cause.** In `server/src/services/JourneyService.ts:58-64` (at 1ec4320), the daily-limit, "already live?" and "riding as a passenger" checks ran on the plain client with no lock. Then came the Maps call. Then, at `:73`, the journey was created in its own transaction. Parallel requests all passed the checks before any of them wrote. The result was 2-3 LIVE journeys. Each one could be started and completed before the daily counter was checked again, which made a third paid trip possible.

**Change.**
- `server/src/core/transaction.ts`: new `lockDriver(tx, driverId)`, which runs `SELECT ... FROM "DriverProfile" WHERE "userId" = ? FOR UPDATE`.
- `JourneyService.goLive`: the three guards moved into a private `assertCanGoLive(db, driverId, now)`.
  - It runs once before Maps, so a refused go-live still never calls Maps.
  - It runs again inside the create transaction, right after `lockDriver`. Postgres READ COMMITTED gives each statement a fresh snapshot, so a request that waited for the lock sees the journey the first one committed and gets `ILLEGAL_STATE_TRANSITION`.
- Error codes and messages are unchanged.
- Third paid trip: closed as a consequence, not by a separate change. A driver can now have only one LIVE/OPEN/FULL/IN_PROGRESS journey at a time, and the existing daily-limit check (now also under the lock) runs again at each go-live. No new rule, no constant.
- I chose a row lock over a DB constraint, so there is no schema or migration change.

**Test.** `server/test/journeys.int.test.ts`, "five simultaneous go-lives for one driver: exactly one LIVE journey, the others ILLEGAL_STATE_TRANSITION (B-NA-001)".
- It fires 5 parallel `POST /api/journeys` through the real app.
- It expects statuses `[201, 409, 409, 409, 409]` with the standard error body, 1 journey row and 1 route row.
- Before the fix it fails: all 5 returned 201. After the fix it passes, 3 runs in a row.

## 2. C-014: pick-up times in the past

**Root cause.** `server/src/services/MatchingService.ts:120` (at 1ec4320) set `pickupTime = departureTime + progress * route.durationSec`. Journeys are matched when they depart up to `MATCH_TIME_TOLERANCE_MIN` (15) before the requested time (`:85`, `:106`). A journey whose departure had already passed therefore produced a pick-up time earlier than now.

**Decision (for the team to accept or reject).** A journey offered in matching is LIVE or OPEN, so it has not started yet. If its departure time has passed, the driver leaves now. The pick-up time is therefore `max(departureTime, now) + progress * durationSec`. This is never earlier than now. No new number, so nothing was added to `shared/src/defaults.ts`. Matching still offers such journeys inside the 15-minute window; only the time shown changes.

**Change.**
- `server/src/services/matching.ts`: new pure `estimatePickupTime(departureTime, now, progress, durationSec)`.
- `MatchingService.findJourneysFor` calls it with `now` from `ctx.clock`. The unused `addMs` import was removed.

**Tests.**
- Unit, in `server/src/services/matching.test.ts` ("estimatePickupTime (C-014 ...)"): a future departure is unchanged; a passed departure counts from now; progress 0 gives exactly now.
- DB, in `server/test/matching.int.test.ts`: "a LIVE journey whose departure time passed 14 minutes ago offers a pickup time from now, never in the past (C-014)".
  - Before the fix it fails: the pick-up time was 14 minutes before now.
  - After the fix it passes.

## Check output (after both commits)
- `npm run typecheck`: exit 0. `npm run lint`: exit 0. `npx prettier --check` on the 7 changed files: all formatted.
- `npm run test:unit`: 26 files, 335 passed, 1 skipped.
- `npm run test:db` (`campushop_test_fixa`): 21 files, 369 passed.
- `npm run docs:check`: up to date. No regeneration needed.

## Not verified / not covered
- Not tried in the running app or the browser; this was API and DB tests only.
- A driver booking a ride as a passenger at the same moment they go live is still a race. The booking path does not take `lockDriver`. Under the lock, the go-live side only re-checks what has already been committed.
- `TripService.start` still has no check of its own for "another journey of this driver is IN_PROGRESS". It relies on go-live allowing only one active journey, which now holds. Journeys inserted directly into the DB (seed or demo scripts) bypass this.
- The driver-first request cards (`findRequestsFor`) do not show a pick-up time, so they needed no change. Client display (`PassengerPages.tsx:233`) is unchanged.
- No DB constraint (a partial unique index on an active journey per driver) was added. That would mean a schema change in a lane-1 file, and it could break test factories that create several journeys for one driver.
