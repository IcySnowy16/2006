# fix-fixc: F2 / C-027 / C-028

- Commit: `e0b83f0`, on branch `worktree-agent-a4f0a0037c26580df`. Worktree: `/home/user/2006/.claude/worktrees/agent-a4f0a0037c26580df`. Not pushed.
- My worktree started at d905a13. I fast-forwarded it to 1ec4320, as the brief asks, before making changes.

## F2 / C-027: the rider left after a cancel or no-show is moved back to $3.00

**Root cause**
- `server/src/services/FareService.ts:55-64` (old): `retier` set every confirmed rider to the headcount fare. With one rider left that is $3.00, so a rider who confirmed at $2.00 was raised without being asked.
- `WalletService.adjustHold` (`WalletService.ts:120-125`) only holds that rise as far as the wallet allows.
- `TripService.complete` (`TripService.ts:187-193`, old) then charged `finalFareFor`, the solo $3.00, so the missing amount became a Debt and the account locked.
- The same thing happened after a NO_SHOW (`TripService.ts:151` calls `retier`).

**Change**
- `FareService.retier` now sets each rider to `min(headcount fare, the fare the rider has now)`.
- A new method, `FareService.payableFare(headcount, riderFare)`, holds that rule.
- `TripService.complete` charges each carried rider `payableFare(finalFareFor, booking.currentFareCents)` and stores that amount as `finalFareCents`. The driver is credited what was actually taken.

**Decision (please accept or reject):** a confirmed rider's fare only falls. It can drop when riders join, but it never rises again when a rider cancels or is a no-show. The driver earns less on that trip.
- I chose this over the brief's default ("never above the fare they confirmed at") because it is smaller and safer:
  - It needs no new column. `currentFareCents` already holds the lowest fare the rider has had.
  - Under the default, a rider who confirmed at $3.00, dropped to $2.00 when someone joined, and then lost that $1.00 of hold would be raised to $3.00 again and hit the same partial-hold trap.
- The cost: a rider who confirmed alone at $3.00 and then shared pays $2.00 even if the other rider leaves.
- It also overrides FR 5.1.3 ("the riders left pay by the new headcount") for both cancel and no-show.
- The decision is recorded in `shared/src/defaults.ts` as DECISIONS "Panel F2 / C-027". There is no new number. `docs/decisions-defaults.md` was regenerated.

**Tests**
- New, unit (`server/src/services/FareService.test.ts`): retier does not raise a confirmed fare (no hold change, no event), plus `payableFare` cases.
- New, database (`server/test/bookings.int.test.ts`): the C-027 walk end to end. B has $2.50 and is confirmed at $2.00 alongside A. A cancels, and B gets no FareChanged. The trip runs start, picked up, dropped off, complete. Result:
  - B pays $2.00 and has $0.50 left.
  - The booking is PAID, B has no Debt, and B stays ACTIVE.
  - The driver gets $2.00.
- Updated (they asserted the old rule):
  - bookings "cancelling one of two riders..." now expects $2.00 and the same hold.
  - trips "NO_SHOW ... re-tiers back to $3.00" now expects $2.00 and no FareChanged.
  - trips "one rider and one no-show pays solo $3.00" now expects $2.00 paid and the driver $2.00.
- All the new and updated tests failed with the old FareService/TripService (4 server-db + 2 unit failures) and pass with the fix.

## C-028: the suggested top-up unlocks but leaves the rider under $2.00

**Root cause:** `client/src/pages/AccountPages.tsx:183` (old) suggested `max(100, owed - available)`. That only covers the debt. For example, Lee owes $0.70: the suggested $1.00 unlocks the account but leaves $0.30, so booking is still refused.

**Change**
- The page now suggests `max(TOP_UP_MIN_CENTS, owed + MIN_BALANCE_TO_RIDE_CENTS - available)`. For Lee that is $2.70.
- The text reads: "Top up $2.70 to pay what you owe and keep $2.00, enough to book your next ride. Your account unlocks by itself."
- A muted line says clearly: "A top-up of $1.00 only unlocks the account: it pays what you owe but leaves less than $2.00, so you could not book yet."
- The suggested amount is also the first button.
- The decision is recorded in DECISIONS as "Panel C-028". `docs/demo-personas.md` scenes 5 and 6 were updated to the new behaviour.

**Tests** (`client/src/pages/AccountPages.test.tsx`)
- The existing locked-page test now expects $2.70, the "Top up $2.70" button and the unlock-only line.
- A new test checks that money already available counts: $0.50 owed with $0.30 available gives $2.20.
- Both failed with the old page and pass now.

## Checks (on e0b83f0)
- `npm run typecheck`: pass. `npm run lint`: pass. `npx prettier --check` on the changed files: pass.
- `npm run test:unit`: 26 files, 336 passed, 1 skipped.
- `test:db` against `campushop_test_fixc`: 21 files, 368 passed.
- `npm run docs:check`: up to date after `npm run docs`.

## Not verified / not done
- I did not run the app in a browser or walk C-027/C-028 by hand. I did not run `scripts/ui-smoke.mjs`: it only checks that "$0.70" is shown, which is unchanged.
- A rider who is still PENDING (not yet accepted) and was quoted $2.00 is still accepted at $3.00 if the other rider leaves first. The wallet is checked at accept, so they cannot run short, but they are not asked first.
- The suggested top-up is not reduced to fit under the $100 wallet cap. A locked rider holding almost $100 is unlikely.
- C-028's other complaint, "earnings never unlock a driver", is not touched: unlocking still only runs after a top-up.
- The booking-on-trust flag (off by default) can still leave a shortfall by design. I did not change that.
