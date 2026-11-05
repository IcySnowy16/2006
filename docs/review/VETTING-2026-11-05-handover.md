# Vetting of the handover prompt (5 Nov 2026)

Checked: `testing/handover/PROMPT.md` and `HANDOVER.md` on `claude/zen-rubin-1xed3z` (commit `854d087`), and the pending fixes. I did not
change that branch. Everything here is on `ccr-88e18ce2-fg7ij0`.

## What the prompt says, checked

| Claim                                                         | Result                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The pushed `PROMPT.md` is the prompt that was pasted          | Same text, word for word                                                                                                               |
| HANDOVER.md has a "Live page" section                         | Yes (added in `854d087`)                                                                                                               |
| `integration2.bundle` restores the fixes                      | Valid bundle; `integration2` = `d707cc7`, needs `1ec4320` (on the branch)                                                              |
| "Ten more fixes"                                              | 10 fix commits plus 6 merge commits in `1ec4320..pending-fixes`                                                                        |
| The patch on `1ec4320` gives the same code as the bundle      | Yes: `git write-tree` after `git apply --index` equals the tree of `d707cc7`                                                           |
| typecheck, lint (`--ignore-pattern '.claude/**'`), docs:check | All pass                                                                                                                               |
| test:unit 351 passed, 1 skipped                               | Exactly that                                                                                                                           |
| test:db 394 passed                                            | Exactly that                                                                                                                           |
| The live page and its 4 data files                            | **Not verified.** This session gets "no such artifact, or no access" for the artifact. Only a session that can open it can do step 3d. |

## A bug the pending fixes still have (V-2)

My independent tests (`server/test/vetting.int.test.ts`), run against the pending code:

| Test                                                                   | Pending fixes                     |
| ---------------------------------------------------------------------- | --------------------------------- |
| G5: 3 parallel Go Live give one journey                                | pass                              |
| F2: a co-rider's no-show does not lock the remaining rider             | pass                              |
| X1: a live driver who added the passenger role can choose DRIVER again | pass                              |
| V-1: one rider, two journeys, parallel bookings give one booking       | pass                              |
| **V-2: going live and booking a ride at the same moment**              | **fails, every run: 201 and 201** |

**Why:** Go Live locks the user's `DriverProfile` row, and booking locks the user's `Wallet` row (the "rider lock"). Different rows, so
the two never wait for each other. Booking also checks "is this person driving?" _before_ taking its lock.

**Fix** (`docs/review/v2-fix-on-d707cc7.patch`, applies on `d707cc7`, 2 files):

- Go Live takes the wallet lock, then the driver-profile lock. That's the same order trip settlement uses (wallet credit, then `driverProfile.update`), so they can't deadlock.
- Booking moves its "driving?" check to after the wallet lock.

With the fix: V-2 passed 10 runs in a row (3 races per run; the last 4 with the final lock order), and the full `test:db` gave 394 of theirs plus 5 of mine passed.
This is related to, but not the same as, the unfixed find N-f2-05 (go live plus a **role switch** at the same moment).

## Also worth putting in front of the panel and judges

- **#6, "the latest sign-up for an unverified address wins."** The handover names the hole itself: a stranger who signs up after the owner can still own the account if the owner enters the newer code. It's better than before, but not closed. Setting the password at verification, or a forgot-password flow, closes it.
- **#4, "nobody charged, even riders already dropped off."** If a driver's phone dies after dropping riders off, those riders ride free and the driver earns nothing. That's a real cost the team should see.
- **My branch duplicates their G5, X1, F2 and V-1 fixes.** Don't merge both. Use their pending set as the base, and take only these from my branch:
  - the V-2 patch above
  - T5: `Booking.canCancel` decided by the server
  - T6: the no-show banner
  - G6: the scheduled-departure note
  - C-026: the honest fare note ("It drops if another rider joins" shows on a $2 fare in their code too)
