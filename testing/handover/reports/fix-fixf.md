# Fixer fixf: N-f1-01 to N-f1-04

- Commit: f89f730 (on top of f2091e0, after `git reset --hard f2091e0`)
- Branch: worktree-agent-ab67cde2ce57eed4b
- Worktree: /home/user/2006/.claude/worktrees/agent-ab67cde2ce57eed4b
- Test database: campushop_test_fixf
- Not pushed. Nothing outside the worktree was touched.

## N-f1-01 (high): one rider, two simultaneous bookings to two journeys
- Root cause: server/src/services/BookingService.ts `book()` locked only the journey row (`lockJourney`, :77), so the "booking in progress" check (:101) did not serialise one rider booking two different journeys. `accept()` never checked whether the rider was already confirmed on another journey.
- Change: `book()` now takes the rider lock (`lockWallet(tx, passengerId)`) right before the active-booking check. `accept()` takes the same lock and then looks for another CONFIRMED booking of that rider on a live journey (LIVE/OPEN/FULL/IN_PROGRESS). If it finds one, it declines the request automatically with CONFLICT. The driver is told "This passenger already has a confirmed seat on another journey, so the request was declined." and nothing is held.
- Why the wallet row: every path already takes it after the journey row (accept's hold, settlement in TripService.complete), and top-up and withdraw lock only the wallet. So journey, then wallet, is the one lock order and it cannot deadlock. A User-row lock would conflict with settlement's later `user.update` (wallet then user) and could deadlock.
- Decision (in shared/src/defaults.ts DECISIONS, "Panel N-f1-01"): one rider can never hold seats on two journeys at once. An Accept for a rider already confirmed elsewhere is declined automatically.
- Tests (server/test/bookings.int.test.ts, new describe "one booking per rider across journeys"):
  - two simultaneous POST /api/bookings by one rider to two journeys give exactly one 201 and one 409 CONFLICT, with 1 booking row (5 rounds);
  - Accept re-check: with two PENDING requests (the state the race used to leave), accepting the second gives CONFLICT, the booking is CANCELLED, held is 300 not 600, and the seat is not taken;
  - two drivers accepting the same rider at the same moment give exactly one CONFIRMED and one hold (5 rounds).
  All three failed before the fix and pass after it.

## N-f1-02: the fare rises between Ask the driver and Accept
- With the new rule (e0b83f0) this still happened. That rule only covers riders who are already CONFIRMED. A PENDING rider's quote (`currentFareCents` on the request) was replaced at accept by `fareForRiders(confirmed + 1)` (BookingService.ts accept, old :165/:181).
- Change: Accept now holds `payableFare(headcountFare, quotedFare)`, which is min(headcount fare, quote). If riders left after the request, the rider keeps the quoted fare. If riders joined, the lower headcount fare still applies, and the retier step lowers the others as before.
- Decision ("Panel N-f1-02"): Accept never holds more than the rider was shown when they asked. The driver earns less on that trip, as in panel F2. I chose this over a warning or asking the rider again because it is the smaller change and matches F2. As a result, a rider with exactly $2.00 is no longer auto-declined in this case.
- Tests: B asks at $2.00, A cancels, Accept holds $2.00 (CONFIRMED, currentFareCents 200, held 200). The same with B having exactly $2.00: confirmed, not declined. A regression test checks that a $3.00 quote still falls to $2.00 when another rider was confirmed in the meantime. The first two failed before the fix. The third passes both before and after, as a guard.

## N-f1-03: a co-rider's no-show raising a picked-up rider's fare
- Re-checked: this is already fixed by e0b83f0. `FareService.retier` only lowers fares (payableFare), and `TripService.complete` charges `payableFare(finalFare, currentFareCents)`. No code change was needed.
- Test added (server/test/trips.int.test.ts, "a co-rider no-show after pickup"). This is the exact panel scenario: B has exactly $2.00, B is PICKED_UP, 3 min 5 s pass, A is marked NO_SHOW. Results: no FareChanged and B stays at $2.00. After drop-off and complete, B's balance is $0.00 and B paid $2.00. There is no debt, B stays ACTIVE and gets no DebtRecorded or AccountLocked. A's hold is released. It passes on f2091e0 too, so it guards the earlier fix rather than reproducing a bug.

## N-f1-04 (low): the Withdraw box accepted '0x2', '0x64', 'Infinity'
- Root cause: client/src/pages/AccountPages.tsx:106 `Math.round(Number(amount) * 100)`.
- Change: a new `centsFromDollars(text)` in client/src/components/ui.tsx uses the same regex as the server's `Money.fromDollars` (`^\d+(\.\d{1,2})?$`, trimmed) and returns null for anything else. Withdraw is enabled only when the amount is valid and at least $1.00. Invalid text shows "Enter a dollar amount like 5 or 5.50." under the box (field-error, role=alert).
- Test (client/src/pages/AccountPages.test.tsx): '0x2', '0x64', '1e2', 'Infinity', '2.505', '-3' and '$2' each keep the button disabled and show the message. ' 2.5 ' enables it and sends `{amountCents: 250}`. It failed before the fix.

## Checks (on f89f730)
- `npm run typecheck`: clean. `npm run lint`: clean. `npx prettier --check` on the 8 changed files: clean.
- `npm run test:unit`: 27 files, 344 passed, 1 skipped.
- `npm run test:db` (campushop_test_fixf): 21 files, 388 passed. The bookings and happy-path suites were run 3 more times and passed each time (41/41), to check that the parallel tests are stable.
- `npm run docs`: regenerated docs/decisions-defaults.md. `npm run docs:check`: up to date.

## Not verified
- Not run in the real app or browser. I did not repeat the panel's e1/e2/e5/e7 scripts against a running server.
- Lock ordering was checked by reading the code, not by a deadlock stress test. The one path it does not cover is an old PENDING request from before this fix being accepted while the same rider's other trip is being settled. That ends in a Postgres deadlock abort (500), not a double charge. With the book-time lock that state can no longer be created.
- No push notice tells the rider that their fare was kept or lowered at Accept. Lowering at accept already sent none before this change.
