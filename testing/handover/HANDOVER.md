# Campus Hop testing and fixes: handover

Written 5 Nov 2026, 10:25am SGT, at the end of the test session in a Claude Code cloud session.
Repository: `IcySnowy16/2006` (a personal testing copy of the team's draft, not the team repo).
Rule kept throughout: nothing was pushed to the team repo `softwarelab3/2006-SCSA-R3`, or to `main`.

## In one paragraph

The draft (commit `6f5050e`) was tested against its own 121-case sheet by a 12-agent panel (4 testers, 8 judges). The verdict was **demo-ready only after fixes, 8 votes of 8**: 37 pass, 79 fail, 4 skip, 1 tie. Three overnight re-runs found no change on `main`. Then the work moved to fixing. Two demo blockers are fixed and pushed (`1ec4320`): the "journey not found" flash and the frozen live map. Seven fixer agents then fixed 8 more of the 11 must-fix items, plus 12 of the 22 new problems that three finder agents found. Those fixes pass every automated check, but **they have not been voted on by the 12-agent panel yet**. They are saved here as a patch and a git bundle, not merged into the branch.

## Where everything is

| What | Where |
|---|---|
| Live status page (updates itself) | https://claude.ai/artifact/9BZLjAAtsMRzG6JVEuq4yt (private to the owner; share it from its Share menu) |
| Standalone copy of that page | `testing/handover/Campus_Hop_Test_Status.html` (opens offline; data is the JSON block at the top) |
| The test sheet (121 cases) | `testing/Campus_Hop_Test_Log.html` |
| Panel verdict, every case | `testing/results-2026-11-05-panel.md`, sheet corrections in `testing/panel-sheet-fixes.json` |
| Overnight re-runs | `testing/results-2026-11-05-{0330,0530,0730}-rerun.md` |
| First single-tester run (40-case sheet) | `testing/results-2026-11-04-cloud-run.md` |
| Fixes not yet voted on | `testing/handover/pending-fixes/` (see "Applying the pending fixes") |
| Fixer reports (cause, change, decision, tests) | `testing/handover/reports/fix-fixa.md` to `fix-fixg.md` |
| New problems found | `testing/handover/reports/find-f1/f2/f3.{json,md}` |

Branch `claude/zen-rubin-1xed3z` = the draft `6f5050e` + the test sheet (`d905a13`) + results + the pushed fixes `1ec4320`.

## Must-fix list (from the panel) and where each stands

| # | Problem | Judges | Status |
|---|---|---|---|
| 1 | Live tracking: rider's dot frozen, no "Driver is N m away", driver map waits for position | 8/8 | **Fixed and pushed** (`1ec4320`); follow-up for rough/stale GPS fixes in the pending fixes (`2d96718`) |
| 2 | Fare goes $2 to $3 when the other rider leaves; remaining rider ends in debt and locked | 8/8 | Fixed, pending (`e0b83f0`) |
| 3 | Live driver who adds the passenger role is locked out of the journey | 7/8 | Fixed, pending (`6b40e14`) |
| 4 | Holds stuck on trips never started or abandoned | 6/8 | Fixed, pending (`e863bb4`; new migration) |
| 5 | "This journey was not found." for 3 to 5 s after Go live | 5/8 | **Fixed and pushed** (`1ec4320`) |
| 6 | An unverified e-mail address can be taken over; no Forgot password | 5/8 | Fixed, pending (`6b40e14`); Forgot password still not built |
| 7 | Go-live race: several live journeys at once, a 3rd paid trip | 3/8 | Fixed, pending (`0b41926`) |
| 8 | Campus fence off (`CAMPUS_BOUNDARY` empty) | 3/8 | **Not a code fix.** Needs the reviewed campus boundary file (docs/SETUP.md step 4), made by someone who knows the campus |
| 9 | Match cards show pick-up times in the past | 3/8 | Fixed, pending (`3e7e131`) |
| 10 | Sign-in limit per network address blocks a whole room | 2/8 | Fixed, pending (`9d862eb`) |
| 11 | Waiting riders flooded with "driver is live" notifications | 2/8 | Fixed, pending (`35f806d`) |

Also fixed, pending: `f89f730` (finder f1: one rider booking two drivers at once and paying twice, fare rising between Ask and Accept, Withdraw accepting "0x64") and `a1dc62a` (finder f3: double taps, `/driver/complete/<any id>` saying "You earned $0.00", "driver has arrived" after the driver drove away, empty preset form for a bad link).

## Rule decisions the team must accept or reject

Each fix that needed a rule picked the smallest one and recorded it in `shared/src/defaults.ts` (DECISIONS) and `docs/decisions-defaults.md`.

| Fix | Decision | What it overrides or costs |
|---|---|---|
| #2 fare trap (`e0b83f0`) | A confirmed rider's fare only ever falls; when a co-rider leaves or is a no-show, the rest keep their lower fare and the driver earns less | Overrides FR 5.1.3 ("riders left pay by the new headcount") |
| #2 locked page (`e0b83f0`) | The suggested top-up covers the debt plus the $2.00 needed to book again (Lee: $2.70, not $1.00) | Demo scenes 5 and 6 updated in docs/demo-personas.md |
| N-f1-02 (`f89f730`) | Accept holds the lower of the quoted fare and the headcount fare | Driver may earn less |
| N-f1-01 (`f89f730`) | A rider holds a seat on one journey at a time; an Accept for a rider confirmed elsewhere is declined automatically | none |
| #6 (`6b40e14`) | An address is owned only once verified; the latest sign-up for an unverified address wins | If a stranger signs up after the owner and the owner enters the newer code, the stranger's password wins; the owner signs up again. Setting the password at verification would close this |
| #3 (`6b40e14`) | A both-roles user who signs in mid-trip gets the trip's role | none |
| #4 (`e863bb4`) | A confirmed journey not started 30 min after departure is cancelled; a trip in progress with no driver position for 30 min is ended; holds released; nobody charged, even riders already dropped off | New cancel reasons NOT_STARTED, ABANDONED; migration `20261105000000_trip_timeouts` |
| #10 (`9d862eb`) | 10 failed attempts a minute per e-mail; 5 resends a minute per e-mail; 100 a minute per network address | Someone who knows a classmate's e-mail can lock them out of sign-in for a minute |
| #11 (`35f806d`) | At most one unread "driver is live" per request, none while a booking is pending or confirmed | none |
| N-f3-02 (`a1dc62a`) | Driver more than 100 m from the pickup after "arrived": rider sees "Your driver has moved away from your pickup" | Screen only; the server status stays Arrived |

## Checks on the combined pending code (all fixes together, `d707cc7`)

typecheck clean; lint clean (run `npx eslint --ignore-pattern '.claude/**' .` if agent worktrees exist, or ESLint runs out of memory); docs:check up to date; `test:unit` 351 passed, 1 skipped; `test:db` 394 passed (was 367 before the fixes). Each fixer showed its new tests fail on the old code and pass on the new. Prettier warns only on Markdown/HTML result files and the existing docs/SETUP.md.

Checked in the running app with a browser: fixes #1 and #5 (journey page shows at once; the rider's dot moved on 5 of 5 samples with the distance line updating). Fixes A to E were also running in the app when this was written (Go live and matching worked; background jobs logged no errors). **Not yet checked in a browser:** most of the pending fixes individually, and F and G at all.

## Still open

- Must-fix #8 (campus fence) and "Forgot password" (#6).
- New problems not fixed (details in `reports/find-f2.json`, `find-f3.json`):
  - N-f2-01: a name made of invisible or right-to-left characters is accepted.
  - N-f2-02: two drivers can save the same plate.
  - N-f2-04: two tabs of one account disagree about the role.
  - N-f2-03: riders on a shared trip receive each other's pickup updates over the socket.
  - N-f2-05: go-live and a role switch at the same moment both succeed.
  - N-f2-06: parallel sign-ups give a generic 409.
  - N-f3-04: reload during a trip clears the car until the next fix.
  - N-f3-06: no mark for the rider's stop on the map.
  - N-f3-11: Profile does not show the saved vehicle.
  - N-f3-12: distances are never in km.
- Known gaps each fixer listed under "Not verified" in its report.

## Applying the pending fixes

Both files reproduce exactly the tested code (checked: the patch on `1ec4320` gives a tree identical to `d707cc7`).

Option A, one patch (simplest):
```bash
git checkout -b pending-fixes 1ec4320
git apply --index testing/handover/pending-fixes/all-fixes-on-1ec4320.patch
git commit -m "Apply the pending fixes (fixers A-G)"
```
Option B, full history with every fixer's commit:
```bash
git fetch testing/handover/pending-fixes/integration2.bundle integration2:pending-fixes
```
Then `npm install`, `npm run build:shared`, `npm run db:generate`, `npm run db:deploy` (applies the new migration), `npm run demo:reset`, and run the checks above.

The 10 commits are listed in `git log 1ec4320..pending-fixes`. Copying them into the team repo is a team decision, after the votes.

## Next steps (in order)

1. The owner's live feedback on the running app.
2. The 12-agent panel on the pending fixes: 2 testers argue they are good, 2 argue they are bad, and 8 judges vote, independently and after all 4 reports are in, on keeping each fix, on the 22 new finds and on demo readiness. Majority decides; ties stay ties.
3. Merge the fixes that are kept into `claude/zen-rubin-1xed3z`, re-run all checks, and push.
4. The team copies the accepted fixes into `softwarelab3/2006-SCSA-R3` and makes the campus boundary file.

## Running it (for another session)

- Node 22, Docker. `npm install`, `npm run build:shared` (needed before `demo:reset` on a fresh clone; `npm run dev` does not build it), copy `.env.example` to `.env` and add `SEED_SYNTHETIC_CATALOG=1` and `SEED_DEMO_USERS=1`, `npm run dev`, `npm run demo:reset`. Web http://localhost:5173, API :3000, fake inbox http://localhost:8025.
- Demo accounts (password `demo-password-1`): demo.driver (Dana), demo.rider1 (Priya, $20), demo.rider2 (Wei, $1), demo.rider3 (Sam, $2.50), demo.locked (Lee, owes $0.70), all `@e.ntu.edu.sg`.
- Leave `GOOGLE_MAPS_API_KEY` empty for this draft: it calls the Directions API, and the provided key is restricted to the Routes API (Staging code), so going live fails with REQUEST_DENIED. Keys belong in `.env` only, never in the repo or a chat.
- In the cloud container, the container restarts every hour or two and kills all processes. A watchdog script (kept outside the repo) restarted Docker and the app within about 30 s each time.
