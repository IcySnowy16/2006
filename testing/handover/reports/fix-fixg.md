# fix-fixg: N-f3-07, N-f3-08, N-f3-09, N-f3-02, N-f3-10

- Commit: `a1dc62a` on branch `worktree-agent-a412d4990f6b495a8`, worktree `/home/user/2006/.claude/worktrees/agent-a412d4990f6b495a8`, on top of `f2091e0` (integration, after `git reset --hard f2091e0`). Not pushed.
- Files: `client/src/api/hooks.ts`, `client/src/pages/DriverTripPages.tsx`, `client/src/pages/PassengerPages.tsx`, `client/src/pages/DriverSetupPages.tsx`, `shared/src/defaults.ts`, tests in `client/src/pages/DriverPages.test.tsx` and `client/src/pages/PassengerPages.test.tsx`. No server change.
- I did not change the distance-line rules from 2d96718 (fresh, accurate fix; nothing shown inside ARRIVED_M). The new N-f3-02 rule uses the same `awayM`, so a rough or stale fix never counts.

## Shared piece: `useOneAtATime()` (client/src/api/hooks.ts)
A second tap can arrive before React draws the button busy: TanStack's `isPending` reaches the screen on a later tick. So the guard is a ref. It is set straight away and released in the per-call `onSettled`, which runs after the mutation's own `onSettled` refresh. That way a card that has been answered is already gone when the guard reopens. This is the same pattern as `sending` in AccountPages TopUp.

## N-f3-07: Decline has no busy state
- Root cause: `DriverTripPages.tsx:259` (at f2091e0). Decline had no `busy` or `disabled`. Accept's busy covered only that one button and appeared only after a re-render.
- Change: Accept and Decline on every card share one guard, and both are disabled while either answer is in flight. Decline now shows busy for its own card.
- Test: "one answer at a time: a double tap on Decline, or Accept then Decline, sends one request and shows no error". A mock server answers a second request with the real 409 sentence. The test checks that exactly one POST is sent and that the sentence never appears.

## N-f3-08: double tap on "Ask the driver" / "Yes, cancel"
- Root cause: `PassengerPages.tsx:327-333` ("Ask the driver" `book.mutate`) and `:459` (the ConfirmDialog `onConfirm` `cancel.mutate`). In both places `busy` only applied after a re-render.
- Change: both calls go through `useOneAtATime`.
- Tests: "a double tap on 'Ask the driver' asks only once" and "a double tap on 'Yes, cancel' cancels only once". Each counts the POSTs and expects 1.
- The driver's "Yes, cancel it" (cancel journey) has the same pattern. I left it alone because it was not in scope.

## N-f3-09: /driver/complete/<any id> says "Trip complete, $0.00"
- Root cause: `DriverTripPages.tsx` `TripCompletePage` (around line 437 at f2091e0). It never looked at the journey: it only listed bookings and wallet credits.
- Change: the page reads the journey from `journeys.mine`, as the journey and trip pages already do. The bookings and ledger queries run only for a COMPLETED journey.
  - Unknown id: shows "This trip was not found."
  - IN_PROGRESS: redirects to `/driver/trip/<id>`.
  - Any other status that is not COMPLETED: redirects to `/driver/journey/<id>`. That page already explains a cancelled or expired journey.
- Tests: "a journey that is not completed has no summary: unknown says not found, live goes to its page". The two existing Trip complete tests now mock a COMPLETED journey.
- Limit: `journeys.mine` returns the newest 50 journeys, so the summary of a much older journey would read "not found". The page is normally opened just after Complete, so I accepted that.

## N-f3-02: "Your driver has arrived." after the driver drove away
- Root cause: `PassengerPages.tsx:405-410` (at f2091e0). The arrived banner depends only on the pickup status, and the distance line shows only for WAITING or APPROACHING. On the server, `LocationService.ts:79-93` only moves a status forward (this is by design, and the no-show wait starts at ARRIVED).
- **Decision (please accept or reject):** a screen-only rule on the rider page. If the pickup status is ARRIVED and a fresh, accurate fix puts the driver more than **`DEFAULTS.LEFT_PICKUP_M` = 100 m** from the pickup, the rider sees a warning instead of "Your driver has arrived.":
  - "Your driver has moved away from your pickup and is N m away. Call them if you are not sure."
  - Why 100 m: it is well beyond ARRIVED_M (30) plus the error a counted fix may have (LOW_ACCURACY_M, 50), so GPS jitter at the stop does not flip the banner.
  - The pickup status stays ARRIVED and the server's state machine is unchanged.
  - The status chip still reads "Arrived". No status exists for "left"; adding one would be a server or state-machine change.
- "Approaching" at 332 m: not changed. In APPROACHING the distance line already shows the real distance ("Driver is 332 m away, about 1 min."), so the chip only means "came within 300 m". Changing that needs a backwards status on the server.
- Test: "after 'arrived', a driver who drove away is shown as gone with the distance; jitter at the stop is not". At about 56 m it still shows "arrived"; at about 334 m it shows "moved away … 33x m away". The test file's socket mock is now a per-test mutable `channel`, as in DriverPages.test.tsx.

## N-f3-10: /driver/presets/<bad id> shows an empty edit form
- Root cause: `DriverSetupPages.tsx:206` (at f2091e0). The editor fell back to blank values when `existing` was undefined.
- Change: when an id is given, the presets list has loaded and the id is not in it, the page shows "This preset was not found." and a "Back to presets" link.
- Test: "a link to a preset that is not the driver's says so instead of an empty form".

## Checks (after the fix)
- The six new tests fail on the f2091e0 page files (6 failed, 77 passed) and pass after the fix.
- `npm run typecheck`: clean. `npm run lint`: clean. `npx prettier --check` on the changed files: clean.
- `npm run test:unit` (shared, server and client): 27 files, 349 passed, 1 skipped.
- `npm run test:db` against `campushop_test_fixg`: 21 files, 381 passed.
- `npm run docs:check`: up to date.

## Not verified
- I did not check these in a real browser or the running app. All checks are jsdom and msw tests.
- The double-tap tests use two synchronous `fireEvent.click` calls with a 50 ms server delay. That is a fair model of a fast double tap, but not a Playwright run.
- I did not look at the "moved away" banner on a phone screen.
