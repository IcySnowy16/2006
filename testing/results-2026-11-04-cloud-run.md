# Campus Hop test results (40-case sheet, automated run)

Tester: Claude (Playwright, headless Chromium) | Date: 2026-11-04 | Device: Chromium 390-420 px, mobile emulation | Commit: 6f5050e
Pass 22 | Fail 14 | Partial 2 | Skip 2 | Total 40
Set-up: Linux cloud container, Node 22.23, Docker 29, `npm run dev`, `npm run demo:reset` before each scenario. No Google key (the built-in fake route): the key that was provided is restricted to the Routes API, and this draft calls the Directions API, so going live returned `REQUEST_DENIED` and failed.

## New (not tagged on the sheet)

- S3 Known demo state: FAIL as written - on a fresh clone `npm run demo:reset` crashes with `Cannot find module .../@campus-hop/shared/dist/index.js`. `npm run dev` never builds `shared`. It works after `npm run build:shared`. Fix: build shared in `scripts/dev.mjs` (or in demo-reset), or add the step to README/TESTING.md.
- G1 Driver goes live: FAIL - the journey page shows "This journey was not found." for up to 5 s after going live, then fixes itself. Cause: `client/src/pages/DriverTripPages.tsx:88` navigates on success without refreshing the cached `journeys.mine` list (the page polls every 5 s). Fix: `await refresh('journeys.mine')` before `navigate`, or seed the cache with the returned journey.
- T1 Rider sees "driver is N m away": FAIL - the banner never appears. The server sends `pickup:status` with a distance only when the status changes (`server/src/realtime/LocationService.ts:80-83`), not with every position. A rider who opens the screen after the change to Approaching never gets one. `location:update` frames do reach the rider: 13 in 12 s, checked on the socket.
- G6 (detail): a preset whose departure time is after midnight (today 23:00 + 90 min = Thu 00:29) is ignored: the journey goes live at once. Only a same-day departure gets the delay.
- N1 Notifications: PARTIAL - each change makes one notification (accepted, trip started, almost there, arrived, no-show). Opening the list does not lower the unread count; only "Mark all as read" does (not checked).
- N2 Trip history: PARTIAL - the ride is listed with its date, fare and Paid, but not with your rating.
- G4 wording: a declined rider's booking says "Cancelled. Any money on hold has been released.", not "declined". The money is right.

## Known bugs, reproduced

- A2 Non-student address [known C-054]: FAIL - `name@ntu.edu.sg` is accepted. The register page itself says "@e.ntu.edu.sg or @ntu.edu.sg can join".
- A3 Weak password [known C-055]: FAIL - `password1` is accepted. There is no strength bar.
- G5 Go live three times quickly [known NA-001]: FAIL - three tabs pressed at once made 2 LIVE journeys.
- G6 Preset with a schedule [known NA-013]: FAIL - departure 55 min ahead: the journey says "Live" with no warning, and Priya gets "No driver yet".
- T2 Rider map dot [known T2-02]: FAIL - the dot stays still. The rider map is drawn with no route (`client/src/pages/PassengerPages.tsx:402` passes `polyline={null}`), so it re-centres on the single point each time.
- T4 Rating [known NB-014]: FAIL - ratings save once ("You have already rated this ride"), but after a reload both the rider and driver screens show five empty stars and Send rating again.
- T6 No-show rider [known NB-018]: FAIL - Priya gets "You were marked as a no-show. Your hold has been released." and the hold is released, but her booking page still says Confirmed. No-show is allowed 3 min after "I have arrived".
- W5 Top up past the limit [known NB-021]: FAIL - $56 + $50 is refused with "A wallet can hold at most $100.00. Choose a smaller amount." It does not say how much room is left ($44).
- F2 One rider cancels [known PQ-N-presenter-14]: FAIL (exactly as feared) - Priya and Sam both at $2.00. Priya cancels, and Sam's fare goes back to $3.00 while the hold grows to $2.50 (all Sam had). After Complete, Dana earns $2.50 with "A rider could not pay in full". Sam's ride shows Unpaid, the wallet says "You owe $0.50", and the account is LOCKED.
- X1 Driver adds passenger role while live [known NA-012, HIGH]: FAIL - a driver-only account goes live, presses "Also ride as a passenger", then signs out and in. It lands on Choose role. Picking driver gives "Finish or cancel your trip first, then switch role." (HTTP 409), and /driver sends it back to Choose role. The live journey can't be reached.
- P2 Long name [known NB-001]: FAIL - 40 letters with no spaces: the home and profile pages scroll sideways ("Hi AAAA..." runs off the screen).

## Known bugs NOT reproduced (now pass)

- T5 Cancel after pick-up [known NB-002]: PASS - after "Picked up", Priya's screen offers only Call Dana and Back home. No Cancel.
- X2 Same place twice [known NA-002]: PASS - the screen says "Your start and destination must be different places", and the shared schema (`shared/src/endpoints/hop.ts:58`) rejects it on the server too.
- P4 Sideways and big text [known NB-016]: PASS - 844x390 and 200% text: no sideways scroll, nothing covered, the bell stays 44 px or more. At 200% the bottom tabs run together ("Home Request Wallet Trips" with no gaps). The bell badge was not checked at big text (no unread at the time).

## Pass

- S1 Install and start: PASS - npm install, `npm run dev`: API :3000 and web :5173 with no errors.
- S2 Health check: PASS - `{"status":"ok"}`.
- S4 Automated tests: PASS - `test:unit` 26 files, 333 passed, 1 skipped. `test:db` 21 files, 367 passed.
- A1 Sign up: PASS - the code e-mail reached Mailpit in about 3.5 s. Verify leads to Sign in, and the new account signs in.
- A4 Wrong password: PASS - "Incorrect email or password." for both a wrong password and an unknown e-mail.
- A5 Sign out and back in: PASS - you go back to the page you were on (Profile), not an error.
- R1 Choose and switch role: PASS - the home screen and bottom tabs change (driver: Home, Presets, Wallet, Trips; passenger: Home, Request, Wallet, Trips).
- R2 Role switch while live: PASS - "Finish or cancel your trip first, then switch role."
- G2 Rider finds the ride: PASS - Dana listed, $3.00, pick-up Hall B bus stop, 60 m walk. Wallet check: "You have enough in your wallet."
- G3 Ask and accept: PASS - Priya Confirmed. Seats 3 to 2, and $3.00 held (balance 20, available 17).
- G4 Driver declines: PASS - no money held. Run with Priya, not Sam: see the sheet fixes below.
- T3 Payment: PASS - Priya $20 to $17 ("Ride paid $3.00"), Dana earned $3.00.
- W1 Enough balance: PASS - no banner.
- W2 Low balance warning: PASS - "getting low ($2.50 available)" banner. As the second rider the $2.00 fare says "enough". Solo $3.00 says "Not enough balance for this ride", and Ask the driver is disabled.
- W3 Too low: PASS - "Top up to at least $2.00" banner and Find a ride refused. The account is not locked.
- W4 Top up: PASS for $5.00 exactly (1.00 to 6.00). SKIP for $1.37: there is no custom amount field, only buttons $5 to $100.
- W6 Locked account: PASS - the banner is on every screen, What you owe $0.70, and Top up $1.00 (only on the /locked page) gives "You owe nothing. Your account is active." with $0.30 left.
- F1 Two riders share: PASS - Priya's fare $3.00 to $2.00 once Sam was accepted. Sam's offer showed $2.00.
- P1 Layout at 390 px: PASS - 10 screens checked with the repo's own phone audit: no sideways scroll, no tap target under 44 px, no input under 16 px, nothing covered.

## Skip

- P3 Install as an app: SKIP - needs a real phone.
- Z1 Free exploring: SKIP - folded into the notes above.
- (Note on T1) replay-gps: the command works (`--url` is optional and defaults to :3000). Only the rider-side display fails.

## Sheet corrections (40-case version)

- G4: Sam ($2.50) cannot ask for a $3.00 solo ride, so "Repeat G2 with Sam" is impossible. Use Priya, or have Sam join as the second rider ($2.00).
- G4 / F1: after a decline the rider's request stays open. A new Request says "You already have an open request" and offers "See its matches", so the steps should say to use that.
- G1: the preset label on screen is "Shared ride to the gate (3 seats)".
- W4: there is no custom amount field, so drop the $1.37 step or mark it Skip.
- W6: the Top up $1.00 button is only on the "See what you owe" (/locked) page, not on Wallet.
- T6: add "wait 3 minutes after I have arrived": No-show is disabled until then.
- X1: Dana already holds both roles after demo:reset, so the case needs a new driver-only account (sign up as "Driver: I give rides", create a preset, go live, then Profile > "Also ride as a passenger").
- S3: add `npm run build:shared` before `npm run demo:reset` until dev.mjs builds it.
