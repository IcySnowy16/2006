# Fixer fixd: C-043 and C-035

- Commit: `e863bb4` "[C-043][C-035] End unstarted and abandoned trips, release the holds"
- Branch: `worktree-agent-a65f30f18a4cb3312` (not pushed)
- Worktree: `/home/user/2006/.claude/worktrees/agent-a65f30f18a4cb3312`
- Base: my worktree started at d905a13, 7 commits behind the brief's base. Its tree was clean, so I fast-forwarded it to 1ec4320 before working. The commit's parent is 1ec4320.

## C-043: a driver who never starts keeps every rider's money on hold

**Root cause.** Nothing ever ends an OPEN or FULL journey that is not started. The jobs in `server/src/jobs/index.ts:19-25` (before the fix) only expire LIVE journeys with no confirmed booking (`GeofenceService.expireDue`, which requires `status: 'LIVE'`). Once a rider is confirmed, the journey moves to OPEN or FULL and no sweep looks at it again (`server/src/jobs/sweeps.ts`). The holds stay, and the driver cannot go live again (`JourneyService.ts:58`, active journey check).

**Change.**
- New sweep `cancel-unstarted`, which runs every 60 s and calls `Sweeps.cancelUnstarted()` in `server/src/jobs/sweeps.ts`. It finds every OPEN or FULL journey whose `departureTime` is at least `DEFAULTS.UNSTARTED_TIMEOUT_MIN` in the past. It cancels each one through the existing `JourneyService.cancel(id, 'NOT_STARTED')`. That is one transaction under the journey lock: PENDING and CONFIRMED bookings are cancelled and every hold is released, with a RELEASE row in the ledger. If the driver started the trip in the meantime, the call raises ILLEGAL_STATE_TRANSITION and the sweep skips that journey.
- New `CancelReason` value `NOT_STARTED`, added in `shared/src/enums.ts`, the Prisma enum and migration `20261105000000_trip_timeouts`.
- Notifications are in `NotificationService.ts`, on the JourneyCancelled event:
  - Each rider: "This trip was cancelled because it was not started in time. Any money on hold has been released." This is the text the test sheet asks for.
  - The driver: "Your journey was cancelled because it was not started within 30 minutes of departure. The money held for your riders was released."
- The driver's journey page (`client/src/pages/DriverTripPages.tsx`) names the reason.

**Decision (proposed).** `UNSTARTED_TIMEOUT_MIN = 30`, counted from the journey's **departure time**. For a scheduled preset that is the scheduled time, not the moment the driver went live or accepted. Only OPEN and FULL journeys are swept. A LIVE journey with nobody confirmed is still left to the existing 15-minute expiry. The value is in `shared/src/defaults.ts`, with a row in DECISIONS ("Fix C-043"), and `docs/decisions-defaults.md` has been regenerated.

## C-035: a trip the driver starts and abandons keeps the hold, and the rider cannot cancel

**Root cause.** Several pieces combine:
- `server/src/entities/Journey.ts:35` allowed only `IN_PROGRESS -> COMPLETED`.
- `JourneyService.ts:116` refuses a cancel once the trip is in progress.
- `BookingService.ts` (around 229-233) refuses a rider's cancel on a trip in progress.
- `Booking.cancel()` refuses a rider who was picked up.
- No sweep watches IN_PROGRESS journeys.

So the trip could only end when the driver completed it.

**Change.**
- New sweep `end-abandoned`, which runs every 60 s and calls `Sweeps.endAbandoned()`. It finds IN_PROGRESS journeys that meet both conditions:
  - they started at least `DEFAULTS.ABANDONED_TRIP_TIMEOUT_MIN` ago;
  - no driver position has been **received** in that window.
- For each one it calls the new `TripService.abandon(journeyId, cutoff)`, which runs one transaction under the journey lock:
  - it re-checks both conditions, so running it twice, or a position arriving at the same moment, changes nothing;
  - `Journey.abandon()` moves the journey to CANCELLED with cancelReason ABANDONED;
  - every CONFIRMED booking has its hold released (with a ledger RELEASE row) and becomes CANCELLED with heldCents 0;
  - nothing is deducted, the driver gets no credit and the daily paid-trip counter is not incremented;
  - JourneyCancelled (reason ABANDONED) is sent after the commit.
- `LocationUpdate.receivedAt` is a new column, set from the Clock in `TripService.start` and `LocationService.handleUpdate`. The timeout reads this column and not the phone's `ts`, so a phone whose clock is wrong can neither end a live trip early nor keep a dead one alive. The migration adds the column with DEFAULT CURRENT_TIMESTAMP for old rows, plus an index on (journeyId, receivedAt).
- `Journey`: `IN_PROGRESS -> CANCELLED` is now in the transition table, but only `abandon()` uses it. `cancel()` still throws ILLEGAL_STATE_TRANSITION for a trip in progress and for the reason ABANDONED, so the driver's Cancel, the geofence and the rider's cancel behave exactly as before.
- New `CancelReason` value `ABANDONED`.
- Notifications:
  - Each rider: "This trip was ended because the driver stopped sharing their position. You were not charged and any money on hold has been released."
  - The driver: "Your trip was ended because no position came from your phone for 30 minutes. Nobody was charged."
- After the sweep the driver can go live again. The positions are purged by the existing stop-sharing sweep, which already covers CANCELLED journeys. Late socket positions are dropped quietly.

**Decisions (proposed).**
1. `ABANDONED_TRIP_TIMEOUT_MIN = 30`. The clock starts at the last position the server received, or at the start of the trip if none came.
2. **Nobody is charged on an abandoned trip, including a rider already marked DROPPED_OFF.** The driver never completed the trip, so the driver is not paid. This is the smallest rule that cannot take money wrongly. The alternative is to charge riders who were dropped off; the team can choose that instead.
3. The rider still has no "driver did not come" button. The sweep is their way out. The test sheet accepts either.

Both are in `shared/src/defaults.ts` with comments and a DECISIONS row ("Fix C-035").

## Tests added

The new tests use the FakeClock and fail before the fix: the sweep methods did not exist, and nothing changed the rows.

- `server/test/jobs.int.test.ts`, 6 new tests:
  - **C-043, 2 riders.** At 29:59 nothing happens. At 30:00 the journey is cancelled with NOT_STARTED. A second run does nothing. Each wallet is back to balance 1000 / held 0, with one RELEASE ledger row of 200. The bookings are CANCELLED and the pending request is CANCELLED. Riders and driver get the notification texts above. The driver has no active journey left.
  - **C-043.** A FULL journey is cancelled. A started trip and a LIVE journey with nobody confirmed are left alone.
  - **C-043.** A scheduled departure 60 minutes ahead is counted from the departure time (boundary checked at -1 s and at 0).
  - **C-035, started through the real `/api/journeys/:id/start` route.** The rider's cancel is 409 (unchanged). At 29:59 nothing happens; at 30:00 the trip ends as CANCELLED / ABANDONED with completedAt null. The second run does nothing. The hold is released, there is no DEDUCT row, the driver's wallet stays 0 and dailyPaidTrips stays 0. Rider and driver are told, and a late position is not accepted.
  - **C-035.** The clock counts from the last position the server received. That position's phone timestamp is an hour behind, and it still keeps the trip alive for another 30 minutes. A rider already DROPPED_OFF is not charged either.
  - **C-035.** A trip that sends a position every 10 minutes is never ended (6 rounds).
  - The scheduler test now expects 8 sweeps and their intervals.
- `server/src/entities/entities.test.ts`, 1 new test: `abandon()` works only from IN_PROGRESS and records ABANDONED. `cancel()` still refuses IN_PROGRESS, and refuses the reason ABANDONED.

## Check output

- `npm run typecheck`: pass, all three workspaces.
- `npm run lint`: pass.
- `npx prettier --check` on every changed TS/TSX/MD file: pass. I did not run `prisma format`, because it would reformat the whole schema; I kept the existing hand alignment.
- `npm run docs:check`: pass after `npm run docs`. The regenerated `docs/decisions-defaults.md` is in the commit.
- `npm run test:unit`: 26 files, **334 passed**, 1 skipped (was 333).
- `npm run test:db` against `campushop_test_fixd`: 21 files, **373 passed** (was 367).
- `prisma migrate diff`, from the migrated test database to schema.prisma: "No difference detected".

## Not verified

- I did not check it in the running app (the brief does not allow that). Nobody has watched it over 30 real minutes in a browser, and nobody has seen the notifications in the bell.
- There is no client test for the two new driver-page banner texts. The rider's booking page still shows its generic "This booking is cancelled. Any money on hold has been released." It does not name the reason.
- Not run against the shared or demo database. The migration's `ALTER TYPE ... ADD VALUE` was applied only to my test database.
- The rider still has no exit of their own. Cancel on a trip in progress is still refused, and the only exit is the sweep after 30 minutes.
