# Campus Hop: 12-agent panel verdict on the 121-case sheet

Date: 2026-11-05 (SGT) | App: commit 6f5050e (draft snapshot) | Sheet: d905a13 + f3998b8 | Run on one shared app, no Google key (fake routes)

## How it was decided
- 4 testers ran every case twice: good1 + good2 argued the app is good, bad1 + bad2 argued it is bad (each pair split the 121 cases).
- 8 judges (money, accounts/security, matching/booking, trip/live tracking, screens/phone, sheet vs draft, evidence auditor, demo readiness) voted independently on every case after all 4 reports were in. Final = majority; ties are left as ties.
- Testers agreed on 110 of 121 cases; judges were unanimous on 115.

## Final decision
**Demo ready: YES AFTER FIXES - 8 of 8 judges.** (0 said ready now, 0 said no.)

Results: **37 pass, 79 fail, 4 skip, 1 tie** (Z1, 4-4). By part: A 19 pass / 5 fail / 3 skip / 1 tie; B 13 / 41 / 1; C (bug still seen = fail) 5 not seen / 33 seen.

## Must fix before the demo (how many of the 8 judges put it in their top 8)
1. **8/8** - Live tracking: rider dot never moves, no distance updates, driver map waits for position
2. **8/8** - Fare goes $2 to $3 when the other rider leaves; remaining rider ends in debt and LOCKED
3. **7/8** - Live driver who adds the passenger role is locked out of the journey
4. **6/8** - Holds stuck on trips never started or abandoned (no sweep)
5. **5/8** - "This journey was not found." for 3-5 s after Go live
6. **5/8** - Unverified e-mail can be taken over; no Forgot password
7. **3/8** - Go-live race: several live journeys, 3rd paid trip
8. **3/8** - Geofence off (CAMPUS_BOUNDARY empty)
9. **3/8** - Match cards show pick-up times in the past
10. **2/8** - Per-IP sign-in rate limit blocks a demo room
11. **2/8** - Waiting riders flooded with driver-live notifications

## Split votes (not unanimous)
- Z1 Anything surprising: **TIE(PASS/FAIL)** (4P/4F/0S; testers good/bad PASS/FAIL)
- C-040 Phone numbers: who sees them, when, and for how long: **FAIL** (3P/5F/0S; testers good/bad PASS/FAIL)
- C-043 Driver never starts after accepting: is the hold released?: **FAIL** (0P/7F/1S; testers good/bad FAIL/FAIL)
- C-050 Switch the internet off: the offline banner: **FAIL** (0P/7F/1S; testers good/bad FAIL/FAIL)
- C-051 Dry-run the whole demo story with fresh accounts: **PASS** (5P/3F/0S; testers good/bad PASS/FAIL)
- B-NA-011 Expiry and the no-show boundary behave as designed on the night app (nothing wrong found); timings seen: **PASS** (7P/1F/0S; testers good/bad PASS/FAIL)

## Every case

### Part A

| Case | Final | Votes | Known | Judges' reason (one) |
|---|---|---|---|---|
| S1 | **SKIP** | 0P/0F/8S |  | Both sides agree; Not re-run: the panel shares one running dev server that must not be restarted; the running instance answers on both ports. |
| S2 | **PASS** | 8P/0F/0S |  | Both testers agree; Health endpoint answers healthy JSON. |
| S3 | **SKIP** | 0P/0F/8S |  | Both sides agree; Not run: demo:reset is forbidden on the shared database. Look-only check: the locked persona Lee exists with the documented state. |
| S4 | **PASS** | 8P/0F/0S |  | Both testers agree; npm run test:unit: 26 files passed, 333 tests passed, 1 skipped, 0 failed. test:db not re-run (shares the database server). |
| A1 | **PASS** | 8P/0F/0S |  | Both testers agree; UI sign-up with a new @e.ntu.edu.sg address, code from Mailpit, Verify, then sign-in works and lands on 'Hi Good1'. |
| A4 | **PASS** | 8P/0F/0S |  | Both testers agree; Wrong password and unknown e-mail give the same neutral message. |
| A5 | **PASS** | 8P/0F/0S |  | Both testers agree; Sign out from Profile goes to /login; signing in again returns to the page you were on (Profile), no error. |
| R1 | **PASS** | 8P/0F/0S |  | Both testers agree; Choose role and the top-bar pill switch both ways; home screen and bottom tabs change each time. |
| R2 | **PASS** | 8P/0F/0S |  | Both testers agree; Switching role while a journey is live is refused with a clear sentence. |
| G1 | **FAIL** | 0P/8F/0S |  | Both testers agree; Go live works and lands on 'Your journey' with 'Live', but the journey page first shows 'This journey was not found.' for over 4 seconds. |
| G2 | **PASS** | 8P/0F/0S |  | Both testers agree; Own driver listed with fare and pick-up point; the confirm page says 'You have enough in your wallet.' |
| G3 | **PASS** | 8P/0F/0S |  | Both show held 300 and available 1700 after Accept, which matches WalletService.hold. |
| G4 | **PASS** | 8P/0F/0S |  | Both show heldCents 0 after Decline, with a clear bell line. |
| T1 | **FAIL** | 0P/8F/0S |  | Both testers agree; Start, Picked up, Dropped off and Complete trip all work and replay-gps runs, but the rider never sees 'driver is N m away' (only the chip 'Approaching') and the rider dot does not move. |
| T2 | **FAIL** | 0P/8F/0S | T2-02 | Both testers agree; Known gap T2-02 reproduced: the rider's car dot stays still while replay-gps runs (the driver's own map does show the car). |
| T3 | **PASS** | 8P/0F/0S |  | Both show rider 2000 -> 1700 and driver +300; FARE_SOLO_CENTS=300 is deducted and credited (TripService.complete). |
| W1 | **PASS** | 8P/0F/0S |  | Both testers agree; $20 rider: no warning banner on Home, Wallet or the Request screen. |
| W2 | **PASS** | 8P/0F/0S |  | good1 shows the getting-low banner at $2.50 (LOW_BALANCE_WARN_CENTS 300), a $2.00 seat allowed and $3.00 refused with Ask greyed. |
| W3 | **PASS** | 8P/0F/0S |  | Both show the 422 'Top up to at least $2.00' (MIN_BALANCE_TO_RIDE_CENTS 200) with the account still ACTIVE. |
| W4 | **PASS** | 8P/0F/0S |  | 100 -> 600 cents exactly (both). |
| W6 | **PASS** | 8P/0F/0S |  | Both sides agree; Look-only on Lee: locked banner on every screen visited and 'What you owe $0.70'. The unlock-by-itself half was proven on an own locked account (C-028), not on Lee. Spot-checked against the auth code an |
| F1 | **PASS** | 8P/0F/0S |  | Both show the retier to $2.00 with 'Hold released $1.00' and a FARE_CHANGED bell, matching FareService.retier and adjustHold. |
| F2 | **FAIL** | 0P/8F/0S | PQ-N-presenter-14 | Known danger reproduced and the amounts check out. A $2.00 rider retiered to $3.00 can only hold what is available (adjustHold partial), so deduct leaves a $1.00 shortfall (good1) or $0.50 for a $2.50 rider (bad1). Accou |
| N1 | **PASS** | 8P/0F/0S |  | Both testers agree; Each change made one notification for the rider and the driver bell counted the new request; unread counts are shown. |
| N2 | **FAIL** | 0P/8F/0S |  | Both testers agree; The finished ride is listed with date, fare and Paid, but not with the rating given. |
| P1 | **PASS** | 8P/0F/0S |  | Both testers agree; 11 screens at 390x844 pass the panel's phone audit: no sideways scroll, no target under 44 px, no input under 16 px, nothing covered. |
| P3 | **SKIP** | 0P/0F/8S |  | Both sides agree; Needs a real phone and 'Add to Home screen'; not emulated. |
| Z1 | **TIE(PASS/FAIL)** | 4P/4F/0S |  | Exploration case whose only expectation is writing surprises down; both did, so good1 and bad1 both satisfy it. bad1's surprises are real and noted: withdraw pays out top-up money (WalletService.ts withdraw has no earnin |

### Part B

| Case | Final | Votes | Known | Judges' reason (one) |
|---|---|---|---|---|
| C-001 | **FAIL** | 0P/8F/0S | T1-05, T3-17, T1-01, S48 | Both testers agree; The sign-up -> code -> verify -> sign-in flow works end to end, but the two known UX gaps are present: no 'Account verified' message after Verify, and the first page has no pitch or price. |
| C-004 | **FAIL** | 0P/8F/0S | S1, S3, T3-37 | Both testers agree; Bug seen: an unverified sign-up blocks the real owner, anyone can resend+verify the code, and the first password owns the account; no Forgot password link. |
| C-055 | **FAIL** | 0P/8F/0S |  | Both testers agree; No strength bar or word; weak passwords such as 'password' are accepted. On the good side: spaces/symbols and a 64-character phrase are accepted, 129 chars refused (cap 128). |
| C-002 | **FAIL** | 0P/8F/0S | T1-02, T1-03, C24 | Both testers agree; All bad inputs are refused, but the messages are raw library text and 12345678 is accepted. |
| C-003 | **FAIL** | 0P/8F/0S | T3-16, T1-06, S14 | Both testers agree; Lock-out after 3 wrong codes and new-code flow work (newest code verifies, old code rejected), but messages stack: two warnings after the 3rd try, and the old error stays next to 'A new code is on its |
| C-005 | **PASS** | 8P/0F/0S | T3-18 | Both testers agree; Signing out in window A signs window B out too and B shows the login page (the designed 'sign out everywhere'), not an error. |
| C-054 | **FAIL** | 0P/8F/0S |  | Both testers agree; @ntu.edu.sg (staff) is accepted and a code is mailed; this matches the app's own stated rule, so it is a spec decision rather than a defect in the code. |
| C-007 | **FAIL** | 0P/8F/0S | T2-21 | Both testers agree; Bug seen on a driver-only account: after 'Also ride as a passenger' and a new sign-in, both role buttons are refused and the live journey cannot be reached or cancelled. |
| C-006 | **PASS** | 8P/0F/0S | T1-23 | Both testers agree; Role choice at sign-in, the pill, the Switch role page, tab change and Profile roles/Switch role/Become a driver are all present and work. |
| C-008 | **FAIL** | 0P/8F/0S | T2-15, T1-22, T3-15, T3-14 | Both testers agree; The vehicle-first guard works (Save preset grey until a vehicle is saved, card disappears, preset saves, declaration enforced) but a 14-character plate is rejected only with 'Please fill this in', and |
| C-009 | **FAIL** | 0P/8F/0S | T3-10, C21 | Both testers agree; Deleting a preset that is in use is correctly refused with a clear sentence, but the sentence is on the page behind the dialog, which stays open. |
| C-010 | **FAIL** | 0P/8F/0S | T3-12 | Both testers agree; The pickup-type rule works (carpark-only driver hidden from a bus-stop-only place, visible again once bus stops are ticked) but neither side is told why. |
| C-011 | **FAIL** | 0P/8F/0S | T1-28, T3-13, T3-34, T51 | Both testers agree; Go live from a preset works with a short campus route (0.7 km, about 1 min), 'Live' and '3 seats free'; the one gap is that after 'Yes, cancel it' you land on driver Home with no confirmation line. |
| C-012 | **FAIL** | 0P/8F/0S | T3-01, T2-04, T5, T31 | Both testers agree; Bug seen: going live 14 km from campus is allowed (17.4 km route) and the journey is still Live after 3 minutes with no banner. |
| C-013 | **FAIL** | 0P/8F/0S | T2-14, T3-06, T3-43 | The block works with the right sentence (both agree), but both good1's and bad1's evidence show no hint on Home, which is the case's bad bullet; bad1 decided it. |
| C-014 | **FAIL** | 0P/8F/0S | T1-15, T3-11, T1-09, T51, T42 | bad1 decided it: past pick-up times (03:15 at 15:26) were offered, which is a bad bullet; matching.ts:85/106/120 matches journeys departing up to the window before the request time and never filters pickupTime >= now. |
| C-015 | **FAIL** | 0P/8F/0S | T3-02, C52, S44 | Both testers agree; Bug seen: the plate and model (SGD1234A, Toyota Prius) are on no rider screen, only the driver's first name. |
| C-016 | **FAIL** | 0P/8F/0S | T1-18, T3-42, T2-10 | bad1 reproduced the exact bad bullet: 'See its matches', then 'Wait for it to end first.', with no Withdraw on the Request page. good1 confirms Withdraw is only on Home. |
| C-017 | **FAIL** | 0P/8F/0S | T18, T33 | Both testers agree; Bug seen: a rider with a pending booking on D1 is still shown to D2 as an open request, and gets 'A driver going your way is live.' |
| C-018 | **PASS** | 8P/0F/0S | T3-44, T1-16, T1-09 | Both testers agree; The two-step booking works: rider asks, the driver card with Accept/Decline appears within about 5 s, Accept turns the rider to Confirmed and holds the fare. |
| C-020 | **FAIL** | 0P/8F/0S | T1-20, T37, T3-09 | Both testers agree; Run once with the full wait: no timer or deadline for 15 minutes; when the journey expired the booking just turned Cancelled. Money was correctly released. The bell also filled with 30+ 'A driver goin |
| C-019 | **PASS** | 8P/0F/0S | T1-10, T3-23 | Both show the $0 warnings, the 422 refusal and the simulated note on Home. good1 also shows the confirm card 'Not enough balance'. |
| C-021 | **FAIL** | 0P/8F/0S | T1-14, T46, T3-39 | Both testers agree; The reason is given in the bell ('The driver declined your request.' / 'Your request could not be confirmed (no seat, no answer or balance too low).') but the booking page itself shows only 'Cancelled |
| C-023 | **PASS** | 8P/0F/0S | T2-23, T3-41, T1-27, M34 | Both: hold released, driver stays live and is told; bad1's remark that the dialog never says the cost is contradicted by the dialog text 'any money held for this ride is released' (PassengerPages.tsx:452). |
| C-024 | **PASS** | 8P/0F/0S | T2-11, C21 | Both testers agree; The known bug is not seen: once the trip has started the rider is not offered 'Cancel booking' at all, so no hidden error dialog can occur. |
| C-022 | **FAIL** | 0P/8F/0S | T53, T2-13 | Both testers agree; Bug seen as written, but safe: on a full solo journey the 2nd card keeps Accept; tapping it is refused with a clear banner and the 2nd booking is cancelled (no double-booking). |
| C-025 | **PASS** | 8P/0F/0S | T2-09 | $3.00 -> $2.00, bell line and 'Hold released $1.00' (both), consistent with retier. |
| C-027 | **FAIL** | 0P/8F/0S | T2-01, M1, M27 | Rider B is locked with a debt after A leaves, and the driver is short at completion (both). This is in line with FareService.finalFare counting only riders picked up, and deduct. |
| C-028 | **FAIL** | 0P/8F/0S | T2-06, C55, M3 | The suggested top-up is max(100, owed - available) (AccountPages LockedAccountPage). It unlocks the account but leaves under $2.00, so booking is still refused with 422 (both). |
| C-026 | **FAIL** | 0P/8F/0S | T2-09, T3-39, T2-18 | Both testers agree; Bug seen: 'Current fare: it drops if another rider joins.' shows on a cancelled booking, on a booking already at $2.00, during a started trip, and on a solo booking. |
| C-029 | **FAIL** | 0P/8F/0S | T1-10, T2-08, T3-29, T3-03 | History rows render <Money cents=amountCents> with a label only and no sign (AccountPages.tsx). The cap refusal is correct. |
| C-031 | **FAIL** | 0P/8F/0S | C43 | Simulated note missing on match cards, driver request cards and My trips (both). |
| C-030 | **FAIL** | 0P/8F/0S | T2-19, T3-28 | No confirmation and no success banner: the onSuccess handler only refreshes (AccountPages.tsx:104). 1.999 is rounded to 200 cents. Withdraw also pays out non-earned top-up money, because WalletService.withdraw only check |
| C-032 | **PASS** | 8P/0F/0S | C31, T1-13, T2-16 | good2 decides it: grey Start with the hint, the blocked-location banner, landing on 'Trip in progress' and the scheduled 409 'It is not yet the departure time.' (bad2) all match the good line. bad2's 403 'not reported a  |
| C-033 | **PASS** | 8P/0F/0S | T1-26, T3-30 | The amounts agree everywhere: good2 shows 2 x $2.00 = driver $4.00, and bad2 shows $3.00 for one carried rider. bad2's mid-ride $2 -> $3 jump after a no-show is outside this case's bad line (noted). |
| C-035 | **FAIL** | 0P/8F/0S | T2-24, T2 | bad2 shows heldCents 300 still held 21 minutes after start, with cancel refused 409. sweeps.ts has no IN_PROGRESS sweep. |
| C-034 | **PASS** | 8P/0F/0S | T3-31, T2-12 | Both show the 409 before 3 minutes, the 200 after, held back to 0 and the bell line. |
| C-036 | **FAIL** | 0P/8F/0S | T2-02, C41, T3-07, C53, T1-12 | Both testers agree; The rider's map dot does not move and no route line is drawn. |
| C-037 | **FAIL** | 0P/8F/0S | T2-03, C19 | Both testers agree; The 'Driver is N m away' banner appears but does not update as the driver moves. |
| C-038 | **FAIL** | 0P/8F/0S | T1-16, T3-08, T2-25 | Both testers agree; Before the trip the driver's journey page still says it waits for the driver's position; on the trip screen it reads 'Live position'. |
| C-039 | **FAIL** | 0P/8F/0S | T26, C1, S45, T1-25 | Both testers agree; Only the wallet and trips notices land on their page; the booking notices land on Home. |
| C-040 | **FAIL** | 3P/5F/0S | S4, T1-24 | Privacy part is good: 403 while PENDING, and the number shows only after tapping 'Call X' (both testers). But the case's second bad bullet, 'No quick-message option exists (only Call)', is confirmed by both good2 and bad |
| C-041 | **PASS** | 8P/0F/0S | T1-17 | Both testers agree; Both sides can rate once, the duplicate is refused, and the stars show on the next match card. |
| C-042 | **FAIL** | 0P/8F/0S | T1-17, T1-19, T3-30 | bad2 decides it: two cancelled bookings render as identical cards and no card names the other person (the bad bullet). good2 says it did not check the two cancelled cards. |
| C-043 | **FAIL** | 0P/7F/1S | M33, T41, T2-22 | Both show $3.00 still held after 31 minutes with the journey OPEN. There is no unstarted sweep in jobs/sweeps.ts. |
| C-044 | **FAIL** | 0P/8F/0S | T37, T3-09 | Both testers agree; The empty journey does expire on time with a clear message, but no deadline is shown beforehand. |
| C-045 | **FAIL** | 0P/8F/0S | T37 | Both testers agree; The open request lapses after 15 minutes and Home returns to 'Where to?', but the rider is not told. |
| C-046 | **FAIL** | 0P/8F/0S | T3-24, T3-25, T1-11 | Both testers agree; No Help, Report, Safety, Privacy or Terms text or button exists in the app. |
| C-047 | **FAIL** | 0P/8F/0S | T3-19, T3-20 | Both testers agree; Unknown address silently goes Home; someone else's booking shows a bare 'You do not have permission to do that.' |
| C-048 | **FAIL** | 0P/8F/0S | T1-29, T2-17, T3-21, T3-40 | good2 decides it: in dark mode 'Cancel booking' is white on rgb(255,138,128), about 2.3:1. Code confirms it: styles.css:38 sets --bad #ff8a80 and .btn-danger uses color #fff (styles.css:464-467). bad2 did not check the r |
| C-049 | **SKIP** | 0P/0F/8S | P3, P6, P2 | Both sides agree; Real phone and Brave not available in this container. |
| C-050 | **FAIL** | 0P/7F/1S | C4, C3 | Both testers agree; The offline banner is right; an offline reload on the dev server gives the browser's error page, not the app shell. |
| C-051 | **PASS** | 5P/3F/0S | T3-43, T3-44, M27 | good2 shows the money adds up (riders $5 -> $3 each, driver $4, which matches FareService 2-rider tier), but its own hesitation list includes the static rider dot (C-036), notification taps landing on Home (C-039) and 'W |
| C-052 | **FAIL** | 0P/8F/0S | T3-22, T3-18 | Both testers agree; At 1280x800 the app is a 598 px column with empty sides; text is readable. |
| C-053 | **PASS** | 8P/0F/0S | T2-05, M27 | Seed state matches the notes: Sam $2.50 low, Lee LOCKED with a 70-cent debt, Dana with 2 presets (both). |

### Part C (PASS = bug not seen, FAIL = bug still seen)

| Case | Final | Votes | Known | Judges' reason (one) |
|---|---|---|---|---|
| B-NA-012 | **FAIL** | 0P/8F/0S | NA-012 | Both testers agree; A live driver who adds the passenger role cannot choose DRIVER again on the next sign-in. |
| B-NA-001 | **FAIL** | 0P/8F/0S | NA-001 | JourneyService.goLive checks the active journey and the daily limit outside any lock, before a slow route call. bad2 got 3 LIVE, 3 IN_PROGRESS and 3 CREDIT rows of 300, with dailyPaidTrips 3. |
| B-NA-002 | **FAIL** | 0P/8F/0S | NA-002 | Both testers agree; The server accepts bookings whose pickup/drop-off do not fit the journey. |
| B-NA-013 | **FAIL** | 0P/8F/0S | NA-013 | Both testers agree; A preset schedule 40 minutes ahead makes the journey invisible to riders, with scheduledGoLive OFF. |
| B-NB-002 | **PASS** | 8P/0F/0S | NB-002 | Both testers agree; Once the rider is picked up the Cancel button is gone. |
| B-NB-018 | **FAIL** | 0P/8F/0S | NB-018 | After a no-show the rider page still says Confirmed and new bookings are blocked until completion (both). The hold release is correct. |
| B-NA-003 | **FAIL** | 0P/8F/0S | NA-003 | TopUpBody is z.int().min(100).max(10000) (shared/src/endpoints/trip.ts:21), so 137 is accepted (both). |
| B-NA-004 | **FAIL** | 0P/8F/0S | NA-004 | Both testers agree; Passwords that differ only after byte 72 are treated as the same. |
| B-NA-005 | **FAIL** | 0P/8F/0S | NA-005 | Both testers agree; Bad URL encodings and NUL characters still give 500 instead of 400. |
| B-NA-006 | **FAIL** | 0P/8F/0S | NA-006 | Both testers agree; The login limit is per address, so other people's tries block a correct login from the same machine. |
| B-NA-007 | **FAIL** | 0P/8F/0S | NA-007 | Both testers agree; The server forwards a 5,000 m-accuracy fix and a 9-minute-old fix to riders as live positions. |
| B-NA-008 | **FAIL** | 0P/8F/0S | NA-008 | Both testers agree; After the driver declines, the open 'Cancel this booking?' box stays on top and 'Yes, cancel' does nothing visible. |
| B-NA-009 | **PASS** | 8P/0F/0S | NA-009 | Both testers agree; No 'Stat Limit: 1/2' and no single 'Passenger: X - Seats: 2' header on the trip screen. |
| B-NA-010 | **FAIL** | 0P/8F/0S | NA-010 | Both testers agree; Stale-tap refusals still show developer sentences with raw status words. |
| B-NA-011 | **PASS** | 7P/1F/0S | NA-011 | The three listed behaviours hold: the no-show refusal at 2:57 and acceptance after 3:00 with the hold released (good2, bad2), and expiry within the 60 s sweep and silent hop-request expiry (bad2). The missing unstarted-t |
| B-NA-014 | **FAIL** | 0P/8F/0S | NA-014 | Both testers agree; After sign-out the old socket stays connected and keeps receiving notifications. |
| B-NB-001 | **FAIL** | 0P/8F/0S | NB-001 | Both testers agree; A 56-letter single-word name widens the page past the phone width. |
| B-NB-003 | **FAIL** | 0P/8F/0S | NB-003 | Both testers agree; Home says 'We will tell you when a driver going your way goes live' while matches exist. |
| B-NB-004 | **PASS** | 8P/0F/0S | NB-004 | Both testers agree; Driver and rider screens agree for a carpark-only preset. |
| B-NB-005 | **FAIL** | 0P/8F/0S | NB-005 | Both testers agree; Editing a preset un-ticks the 'I confirm...' box, so Save stays on the edit page. |
| B-NB-006 | **FAIL** | 0P/8F/0S | NB-006 | Both testers agree; Every screen's document.title is 'Campus Hop'. |
| B-NB-007 | **FAIL** | 0P/8F/0S | NB-007 | Both testers agree; The rider's booking page has no aria-live or role=status region. |
| B-NB-008 | **FAIL** | 0P/8F/0S | NB-008 | Both testers agree; After the session ends elsewhere, the next tap shows Login with no message. |
| B-NB-009 | **FAIL** | 0P/8F/0S | NB-009 | Both testers agree; Verify and resend still tell apart known and unknown e-mails; any code 'verifies' an already verified account. |
| B-NB-010 | **FAIL** | 0P/8F/0S | NB-010 | Both testers agree; Bad booking/match links end on a bare sentence; a finished journey's confirm page says 'No seats are left'. |
| B-NB-011 | **FAIL** | 0P/8F/0S | NB-011 | Both testers agree; The confirmed booking page lacks pick-up time and car details. |
| B-NB-012 | **FAIL** | 0P/8F/0S | NB-012 | Both testers agree; 'Top up your wallet' is still a two-line inline link 19 px tall; the other two links are fixed. |
| B-NB-013 | **FAIL** | 0P/8F/0S | NB-013 | Both testers agree; Title Case labels and a day-first date with seconds still appear next to sentence case. |
| B-NB-014 | **FAIL** | 0P/8F/0S | NB-014 | Both testers agree; Re-opening a rated ride shows the empty star picker again; the server refuses a second rating. |
| B-NB-015 | **FAIL** | 0P/8F/0S | NB-015 | Both testers agree; Profile does not show the e-mail or phone. |
| B-NB-016 | **FAIL** | 0P/8F/0S | NB-016 | Both testers agree; In landscape 844x390 the top bar (64 px) and fixed tabs (51 px) take 115 of 390 px. |
| B-NB-017 | **FAIL** | 0P/8F/0S | NB-017 | Both testers agree; Money is released at once when the driver cancels a confirmed ride, but the page does not say who cancelled or offer another ride. |
| B-NB-019 | **PASS** | 8P/0F/0S | NB-019 | Both testers agree; The confirmation boxes no longer say 'Abort (Keep)'. |
| B-NB-020 | **FAIL** | 0P/8F/0S | NB-020 | Both testers agree; The confirm page says 'You have enough in your wallet' and only refuses after the tap when a booking is already in progress. |
| B-NB-021 | **FAIL** | 0P/8F/0S | NB-021 | The cap sentence gives no room left and the buttons stay enabled (both). |
| B-NB-022 | **FAIL** | 0P/8F/0S | NB-022 | Both testers agree; The single drop-off option still repeats the place name; at 390 px it now fits. |
| B-NB-023 | **FAIL** | 0P/8F/0S | NB-023 | bad2 decides it: with 26 unread, its screenshot NB-023-badge.png shows the '9+' badge over the bell and 'Request' touching 'Wallet'. good2's rider had fewer than 9 unread, so the bug was never reached. |
| B-NB-024 | **FAIL** | 0P/8F/0S | NB-024 | The 'money on hold has been released' wording is shown with no HOLD row ever written (both). The money itself is right. |

## For the Hub (every FAIL, ranked by what blocks the demo)
Known = has an NA-/NB-/C- or older finding id on the sheet; New = found in this run. Paste into the chat that builds hub_items.json.

- [demo blocker 1] T1 Start, pick up, drop off, complete - New in this run - votes 0P/8F/0S
- [demo blocker 1] T2 Rider map dot - Known (T2-02) - votes 0P/8F/0S
- [demo blocker 1] C-036 The rider's map: does the car dot move and is there a route? - Known (T2-02, C41, T3-07, C53, T1-12) - votes 0P/8F/0S
- [demo blocker 1] C-037 'Driver is N m away' and the Arrived messages - Known (T2-03, C19) - votes 0P/8F/0S
- [demo blocker 1] C-038 Driver's own screen says it is waiting for the driver's position - Known (T1-16, T3-08, T2-25) - votes 0P/8F/0S
- [demo blocker 2] F2 One rider cancels - Known (PQ-N-presenter-14) - votes 0P/8F/0S
- [demo blocker 2] C-027 Rider B is locked after rider A leaves (the $2 to $3 trap) - Known (T2-01, M1, M27) - votes 0P/8F/0S
- [demo blocker 2] C-028 Getting out of a locked account: do the numbers agree? - Known (T2-06, C55, M3) - votes 0P/8F/0S
- [demo blocker 3] C-007 A driver who adds the passenger role while live gets locked out - Known (T2-21) - votes 0P/8F/0S
- [demo blocker 3] B-NA-012 A live driver who adds the passenger role is locked out of his own journey after the next sign-in (confirmed on Staging) - Known (NA-012) - votes 0P/8F/0S
- [demo blocker 4] C-035 The driver starts the trip and disappears - Known (T2-24, T2) - votes 0P/8F/0S
- [demo blocker 4] C-043 Driver never starts after accepting: is the hold released? - Known (M33, T41, T2-22) - votes 0P/7F/1S
- [demo blocker 5] G1 Driver goes live - New in this run - votes 0P/8F/0S
- [demo blocker 5] C-011 Go live from a preset and see the route - Known (T1-28, T3-13, T3-34, T51) - votes 0P/8F/0S
- [demo blocker 6] C-004 Show that a stranger can take a classmate's e-mail address - Known (S1, S3, T3-37) - votes 0P/8F/0S
- [demo blocker 7] B-NA-001 Go live three times at once: three live journeys, two trips at the same time, and 3 paid trips in one day (limit is 2) - Known (NA-001) - votes 0P/8F/0S
- [demo blocker 8] C-012 Is the campus fence on? Go live from 14 km away - Known (T3-01, T2-04, T5, T31) - votes 0P/8F/0S
- [demo blocker 9] C-014 Rider asks for a ride and sees a matching driver - Known (T1-15, T3-11, T1-09, T51, T42) - votes 0P/8F/0S
- [demo blocker 10] B-NA-006 Ten wrong sign-in tries from one address stop everyone on that address for a minute, including a correct sign-in by another student - Known (NA-006) - votes 0P/8F/0S
- [demo blocker 11] C-017 A second driver sees a rider who already asked someone else - Known (T18, T33) - votes 0P/8F/0S
- [demo blocker 11] C-020 The driver never answers: the rider waits with no countdown - Known (T1-20, T37, T3-09) - votes 0P/8F/0S
- [demo blocker 11] C-045 An open ride request lapses after 15 minutes - Known (T37) - votes 0P/8F/0S
- N2 Trip history - New in this run - votes 0P/8F/0S
- C-001 Create an account and verify it with the e-mail code - Known (T1-05, T3-17, T1-01, S48) - votes 0P/8F/0S
- C-055 Password strength: is there a strength bar, and are weak passwords refused? - Known (Hub C-055) - votes 0P/8F/0S
- C-002 Try a wrong e-mail, empty forms and short passwords - Known (T1-02, T1-03, C24) - votes 0P/8F/0S
- C-003 Wrong, repeated and replaced verification codes - Known (T3-16, T1-06, S14) - votes 0P/8F/0S
- C-054 Only @e.ntu.edu.sg may sign up: is @ntu.edu.sg refused? - Known (Hub C-054) - votes 0P/8F/0S
- C-008 First preset: vehicle must be saved first and 'Save preset' is greyed - Known (T2-15, T1-22, T3-15, T3-14) - votes 0P/8F/0S
- C-009 Delete a preset that is in use: where does the refusal show? - Known (T3-10, C21) - votes 0P/8F/0S
- C-010 Unticking 'Bus stops' hides the driver and nobody is told why - Known (T3-12) - votes 0P/8F/0S
- C-013 Two paid trips a day: the counter and the block - Known (T2-14, T3-06, T3-43) - votes 0P/8F/0S
- C-015 Does the rider ever see the car plate and model? - Known (T3-02, C52, S44) - votes 0P/8F/0S
- C-016 Ask again while a request is open: where is Withdraw? - Known (T1-18, T3-42, T2-10) - votes 0P/8F/0S
- C-021 When a booking ends without the rider's choice, is a reason shown? - Known (T1-14, T46, T3-39) - votes 0P/8F/0S
- C-022 Solo journey is full: the second request still has an Accept button - Known (T53, T2-13) - votes 0P/8F/0S
- C-026 The fare note 'it drops if another rider joins' appears when it cannot drop - Known (T2-09, T3-39, T2-18) - votes 0P/8F/0S
- C-029 Top up and read the wallet history (signs, cap) - Known (T1-10, T2-08, T3-29, T3-03) - votes 0P/8F/0S
- C-031 Does every money screen say it is simulated? - Known (C43) - votes 0P/8F/0S
- C-030 Driver withdraws earnings - Known (T2-19, T3-28) - votes 0P/8F/0S
- C-039 Tap each notification: where does it go, and is the bell noisy? - Known (T26, C1, S45, T1-25) - votes 0P/8F/0S
- C-040 Phone numbers: who sees them, when, and for how long - Known (S4, T1-24) - votes 3P/5F/0S
- C-042 'Trips' list: duplicate cancelled rows, planned time, no other person - Known (T1-17, T1-19, T3-30) - votes 0P/8F/0S
- C-044 A journey nobody books ends after about 15 minutes - Known (T37, T3-09) - votes 0P/8F/0S
- C-046 Look for help, report and privacy text - Known (T3-24, T3-25, T1-11) - votes 0P/8F/0S
- C-047 Wrong address and someone else's booking link - Known (T3-19, T3-20) - votes 0P/8F/0S
- C-048 Look at every screen at phone width (390 and 360 px) - Known (T1-29, T2-17, T3-21, T3-40) - votes 0P/8F/0S
- C-050 Switch the internet off: the offline banner - Known (C4, C3) - votes 0P/7F/1S
- C-052 Two screens on a projector: size, map and sessions - Known (T3-22, T3-18) - votes 0P/8F/0S
- B-NA-002 The server books any pick-up and drop-off pair: same place twice, a pick-up type the driver refuses, a drop-off that is not the driver's exit - Known (NA-002) - votes 0P/8F/0S
- B-NA-013 A preset with a schedule silently makes 'Go live' wait up to 2 hours: riders cannot see the journey, the driver cannot start it, and nothing on screen says so - Known (NA-013) - votes 0P/8F/0S
- B-NB-018 A rider who was marked a no-show is not told so on the ride page, is offered a Cancel button that is refused, and cannot book another ride until the driver ends the trip - Known (NB-018) - votes 0P/8F/0S
- B-NA-003 Top-up accepts any whole number of cents from $1.00 to $100.00 (for example $1.37), not only the five buttons - Known (NA-003) - votes 0P/8F/0S
- B-NA-004 Two passwords that differ only after the 72nd byte are the same password - Known (NA-004) - votes 0P/8F/0S
- B-NA-005 A bad web address or a hidden NUL character in a text field gives a 500 'Something went wrong' instead of a normal 400 - Known (NA-005) - votes 0P/8F/0S
- B-NA-007 The server stores and broadcasts location fixes of any age or accuracy (a 9-minute-old fix, or a 5,000 m wide circle, reaches the riders) - Known (NA-007) - votes 0P/8F/0S
- B-NA-008 The 'Cancel Booking?' box stays open on a booking the driver already declined, and its button does nothing visible - Known (NA-008) - votes 0P/8F/0S
- B-NA-010 Stale taps show developer sentences with raw status words: 'A rider who is ARRIVED cannot become DROPPED_OFF.' - Known (NA-010) - votes 0P/8F/0S
- B-NA-014 After sign-out the open live connection keeps receiving that user's notifications - Known (NA-014) - votes 0P/8F/0S
- B-NB-001 A long name with no spaces pushes the whole page wider than the phone (greeting, profile) - Known (NB-001) - votes 0P/8F/0S
- B-NB-003 Home says 'We will tell you when a driver going your way goes live' while three matching drivers are already listed - Known (NB-003) - votes 0P/8F/0S
- B-NB-005 Editing a preset always un-ticks 'I confirm that I would make this journey anyway', so the first Save fails with a small message - Known (NB-005) - votes 0P/8F/0S
- B-NB-006 Every screen has the same page title 'Campus Hop' - Known (NB-006) - votes 0P/8F/0S
- B-NB-007 Status changes on the rider's booking page are not announced to screen readers - Known (NB-007) - votes 0P/8F/0S
- B-NB-008 When the sign-in ends in the middle of a task the rider is thrown to Login with no message and loses the form - Known (NB-008) - votes 0P/8F/0S
- B-NB-009 Verify and Send-a-new-code answer differently for unknown e-mails, and any code is accepted for an already verified account - Known (NB-009) - votes 0P/8F/0S
- B-NB-010 Old or wrong booking links end on a bare line with no heading and no way back; the confirm page blames 'No seats are left' for a finished journey - Known (NB-010) - votes 0P/8F/0S
- B-NB-011 After the driver accepts, the rider's page does not show when and where to be, only a route line and 'Waiting' - Known (NB-011) - votes 0P/8F/0S
- B-NB-012 Three in-text links are 20 px tall: 'Top up your wallet', 'Enter your code', 'See its matches'; the first wraps over two lines - Known (NB-012) - votes 0P/8F/0S
- B-NB-013 Mixed capital letters, raw enum words and three time formats - Known (NB-013) - votes 0P/8F/0S
- B-NB-014 Re-opening a finished ride from Trips shows empty stars again; a second rating gets 'You have already rated this ride.' - Known (NB-014) - votes 0P/8F/0S
- B-NB-015 Profile shows name, 'passenger' and 'Active' but not the e-mail or phone number the account uses and shares - Known (NB-015) - votes 0P/8F/0S
- B-NB-016 Turned sideways (844 x 390) the sticky header and fixed bottom tabs take 115 px of 390 - Known (NB-016) - votes 0P/8F/0S
- B-NB-017 When the driver cancels a confirmed ride the rider's page says only 'Cancelled' and offers only 'Back home' - Known (NB-017) - votes 0P/8F/0S
- B-NB-020 Three screens show a button or a green tick for something the server then refuses - Known (NB-020) - votes 0P/8F/0S
- B-NB-021 Top-up over the $100 wallet limit: the message does not say how much room is left and the too-big buttons stay active - Known (NB-021) - votes 0P/8F/0S
- B-NB-022 The drop-off drop-down says the place name twice and is cut off on a phone; it is a drop-down with one choice - Known (NB-022) - votes 0P/8F/0S
- B-NB-023 At 200 percent text size the unread-count badge covers the bell and the bottom tabs touch each other - Known (NB-023) - votes 0P/8F/0S
- B-NB-024 When the driver cancels a request that was never accepted, the rider is told 'Any money on hold has been released' although nothing was held - Known (NB-024) - votes 0P/8F/0S

## Files
Panel briefs, the 4 tester reports (JSON + argument), 8 judge files, tally: Claude session scratchpad panel/ (not in the repo). Sheet corrections agreed by the sheet-vs-draft judge: 44 (see judge6.json sheet_fixes).
