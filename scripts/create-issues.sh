#!/usr/bin/env bash
# Creates one GitHub issue per task. Needs the GitHub CLI: install `gh`, run `gh auth login`, run from the repo root.
# Usage: scripts/create-issues.sh [--dry-run]    Assignees come from docs/team.json ({"Display Name": "github-handle"}); skipped if jq is missing.
set -euo pipefail
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
run() { if [ "$DRY" = 1 ]; then printf "%s\n" "$*"; else "$@"; fi; }
handle() { command -v jq >/dev/null 2>&1 && [ -f docs/team.json ] && jq -r --arg n "$1" '.[$n] // empty' docs/team.json || true; }

run gh label create 'lane:L1' --force >/dev/null 2>&1 || true
run gh label create 'lane:L2' --force >/dev/null 2>&1 || true
run gh label create 'lane:L3' --force >/dev/null 2>&1 || true
run gh label create 'lane:L4' --force >/dev/null 2>&1 || true
run gh label create 'area:BE' --force >/dev/null 2>&1 || true
run gh label create 'area:FE' --force >/dev/null 2>&1 || true
run gh label create 'area:DB' --force >/dev/null 2>&1 || true
run gh label create 'area:INFRA' --force >/dev/null 2>&1 || true
run gh label create 'area:DESIGN' --force >/dev/null 2>&1 || true
run gh label create 'area:QA' --force >/dev/null 2>&1 || true
run gh label create 'area:DOCS' --force >/dev/null 2>&1 || true
run gh label create 'wave:W0' --force >/dev/null 2>&1 || true
run gh label create 'wave:W1' --force >/dev/null 2>&1 || true
run gh label create 'wave:W2' --force >/dev/null 2>&1 || true
run gh label create 'wave:W3' --force >/dev/null 2>&1 || true
run gh label create 'wave:W4' --force >/dev/null 2>&1 || true
run gh label create 'size:S' --force >/dev/null 2>&1 || true
run gh label create 'size:M' --force >/dev/null 2>&1 || true
run gh label create 'size:L' --force >/dev/null 2>&1 || true
run gh label create 'tier:1' --force >/dev/null 2>&1 || true
run gh label create 'tier:2' --force >/dev/null 2>&1 || true
run gh label create 'tier:3' --force >/dev/null 2>&1 || true

A=(); :
run gh issue create --title '[F1] GitHub repo, branches, protection, invite team' --label 'lane:L1,area:INFRA,wave:W0,size:S,tier:1' --body 'Task **F1** (S, 1 pts)

**Done when:** Repo exists with `main` and `dev`; both protected (PR + passing CI + 1 review); all 4 teammates can push branches; the convention files from the plan are committed.

### Build brief

GOAL: Create the shared GitHub repo so four people can work on branches and open pull requests.

BUILD:
1. Create the repo, make the first commit in the existing local repo at D:\dev\campus-hop (it has files but no commits yet), push it as main, then create dev from it.
2. Branch protection on main and dev: require a pull request, one approving review, and the CI check from K10 to pass; disallow force-push and direct commits; allow squash-merge only.
3. Invite the other three members as collaborators with write access. Add their GitHub handles to docs/team.json (display name -> handle).
4. Commit the convention files already written locally: CONTRIBUTING.md, .github/pull_request_template.md, .github/ISSUE_TEMPLATE/task.md, .github/CODEOWNERS (fill real handles).
5. Install the GitHub CLI (gh), run gh auth login, then run scripts/create-issues.sh --dry-run and read the output before running it for real.

RULES:
- Never commit a .env, a Google Maps key or anything in node_modules: check .gitignore before the first push.
- The working copy stays OUTSIDE OneDrive (D:\dev\campus-hop). A synced folder corrupts .git.

TESTS TO WRITE:
- Open a throwaway PR from a branch: it cannot be merged until CI is green and a second person approves.
- A teammate clones, runs npm install and npm test and sees the 19 error-handling tests pass.

READ FIRST:
- CONTRIBUTING.md
- Lab Manual Overview appendix (git workflow)

DO NOT DO IN THIS TASK:
- CI itself (K10)
- Creating the issues is optional until the team has agreed the cut line.

**Branch:** `feat/F1-github-repo-branches-protection-invite`
**PR title:** `[F1] GitHub repo, branches, protection, invite team`
**Depends on:** nothing
**Owns:** .github/**, CONTRIBUTING.md
**Traces to:** Lab3 §3.4.4, Overview appendix

**Watch out:** Plan risk 28 (never commit to main). `gh` is not installed yet: install it and run `gh auth login` before using the issue script.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F3] app.ts / server.ts / health / mount order' --label 'lane:L1,area:BE,wave:W0,size:S,tier:1' --body 'Task **F3** (S, 1 pts)

**Done when:** `GET /api/health` returns 200; mount order is json -> routes -> notFoundHandler -> errorHandler; `app.ts` never calls listen (tests import it).

### Build brief

GOAL: Create the Express app so the server starts and every later task has a place to plug into.

BUILD:
1. server/src/app.ts exports createApp() that builds and returns the Express app WITHOUT calling listen (tests import it with supertest).
2. Mount order: express.json({limit}) -> request-id + logging (K2) -> routes/index.ts under /api -> notFoundHandler -> errorHandler. The error handler must be last.
3. server/src/server.ts loads config, creates the app, calls listen, and wires graceful shutdown (close HTTP server, close Prisma).
4. GET /api/health returns { status: '\''ok'\'', time } and also checks the database with a cheap query (503 via EXTERNAL_SERVICE_UNAVAILABLE if it fails).
5. routes/index.ts has ONE line per route package (auth, presets, journeys, hop-requests, bookings, wallet, trips, notifications, history). F15 pre-creates them so lanes never edit the same line.

RULES:
- Invalid JSON must produce INVALID_JSON, an oversized body PAYLOAD_TOO_LARGE (the catalog already has both).

INTERFACE:
- GET /api/health -> 200 { status: '\''ok'\'' }

ERROR CODES TO USE (from server/src/errors/AppError.ts):
NOT_FOUND, INVALID_JSON, PAYLOAD_TOO_LARGE, EXTERNAL_SERVICE_UNAVAILABLE

TESTS TO WRITE:
- supertest: GET /api/health is 200; GET /api/nope is 404 NOT_FOUND in the standard shape; a body of {bad is 400 INVALID_JSON.

READ FIRST:
- server/src/middleware/errorHandler.ts
- Plan tab: risk 5 (one origin)

**Branch:** `feat/F3-app-ts-server-ts-health`
**PR title:** `[F3] app.ts / server.ts / health / mount order`
**Depends on:** F2
**Owns:** server/src/app.ts, server/src/server.ts, server/src/routes/index.ts
**Traces to:** Lab3 §3.4.1, NFR-3.2

**Watch out:** Plan risk 5 (one origin) is decided here with F14.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F5] Prisma schema (18 entities + passwordHash + EmailVerification) + first migration' --label 'lane:L1,area:DB,wave:W1,size:M,tier:1' --body 'Task **F5** (M, 2 pts)

**Done when:** `prisma migrate dev` works on a clean database; every entity and multiplicity from the class model exists; `User.passwordHash` and an `EmailVerification` table (hashed code, expiry, attempts) are present; Driver/Passenger are profile tables off User.

### Build brief

GOAL: Write the Prisma schema for every entity in the design model, plus the two things the model was missing, and generate the first migration.

BUILD:
1. prisma/schema.prisma with one model per class in 04_design_class_model.puml: User, Driver, Passenger, DriverPreset, Journey, Route, HopRequest, Booking, FareTier, MatchResultSet (store only what must persist), Wallet, WalletTransaction, Debt, LocationUpdate, QuickMessage, Rating, Notification, CampusLocation, PickupPoint.
2. Add User.passwordHash (NFR-2.2) and an EmailVerification table: userId, codeHash, expiresAt, attempts, consumedAt.
3. Driver and Passenger are profile tables that point at User (one User can have both, FR 1.5). Wallet hangs off **User** (decided 13 Oct: every user has a wallet; the passenger pays from it, the driver is paid into it) - key it by userId, not passengerId.
4. Enums: AccountStatus (PENDING_VERIFICATION, ACTIVE, LOCKED), JourneyStatus (LIVE, OPEN, FULL, IN_PROGRESS, COMPLETED, CANCELLED, EXPIRED), CancelReason (DRIVER, GEOFENCE, EXPIRED), BookingStatus (PENDING, CONFIRMED, CANCELLED, COMPLETED), PickupStatus (WAITING, APPROACHING, ARRIVED, PICKED_UP, DROPPED_OFF, NO_SHOW, UNPAID), PaymentStatus, WalletTxType (TOP_UP, HOLD, RELEASE, DEDUCT, PAYOUT, CREDIT), HopRequestStatus (OPEN, MATCHED, EXPIRED), PickupType (BUS_STOP, CARPARK), Plan (SOLO, SHARING).
5. Money columns are integer cents (Int), never Float/Decimal doubles. Times are DateTime in UTC.
6. Indexes you will need: Journey(status, departureTime), Booking(journeyId, status), HopRequest(status, requestedTime), Notification(userId, isRead), LocationUpdate(journeyId, timestamp), unique Rating(bookingId, raterId).
7. Multiplicities from the model: Journey 0..3 Booking; Booking 0..2 Rating; Journey 1 Route; Route has from/to CampusLocation; Booking has pickup and dropoff PickupPoint.
8. User.role holds the roles the user has (DRIVER, PASSENGER, BOTH); add a nullable User.lastActiveRole (DRIVER or PASSENGER) so a user with both roles is returned to the role they used last.
9. User.pushEnabled Boolean, default true: the user'\''s push-notification preference (FR 8.13). Wallet is keyed by userId (the SRS data dictionary now says a wallet belongs to every user).

RULES:
- Seats can never go below zero and wallet balance can never go negative: add database CHECK constraints (seatsAvailable >= 0, balanceCents >= 0, heldCents >= 0) via a raw SQL migration step, as a second line of defence behind NFR-3.1 and NFR-3.3.
- WalletTransaction and LocationUpdate are append-only: no update/delete code paths.

TESTS TO WRITE:
- prisma migrate dev on an empty database succeeds; prisma migrate reset + seed (F6) succeeds.
- A test inserts a Journey with seatsAvailable -1 and the database rejects it.

READ FIRST:
- lab2/v2/vp/plantuml/04_design_class_model.puml
- SRS Appendix A (data dictionary)
- FR 1.4, 10.10, NFR-2.2, NFR-3.1, NFR-3.3

DO NOT DO IN THIS TASK:
- Seed data (F6).
- Do not add tables that are not in the model without telling the team.

**Branch:** `feat/F5-prisma-schema-18-entities-passwordhash`
**PR title:** `[F5] Prisma schema (18 entities + passwordHash + EmailVerification) + first migration`
**Depends on:** K14, X1
**Owns:** prisma/schema.prisma, prisma/migrations/**
**Traces to:** FR 1.4, FR 10.10, NFR-2.2, Lab3 §3.2.1

**Watch out:** Do X1 first so the data dictionary matches. Pin a Prisma version that your toolchain proves works (8.x was still a release candidate when this was written).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F6] Seed (FareTier, verified CampusLocations) + geocoding script' --label 'lane:L2,area:DB,wave:W1,size:M,tier:1' --body 'Task **F6** (M, 2 pts)

**Done when:** `prisma db seed` inserts the 2 fare tiers ($3.00 for 1 rider; $2.00 each for 2-3) and every location whose coordinates are verified in campus_location_catalog.md; a script geocodes the rest with the Maps Geocoding API and writes a reviewable file.

### Build brief

GOAL: Load the fixed reference data: the two fare tiers and the verified campus locations with their pickup points.

BUILD:
1. prisma/seed.ts: upsert FareTier rows {minRiders:1,maxRiders:1,farePerRiderCents:300} and {minRiders:2,maxRiders:3,farePerRiderCents:200} (FR 5.1.1, 5.1.2).
2. Seed every CampusLocation whose coordinates are VERIFIED in Labs/lab1/campus_location_catalog.md: the 23 halls, academic/common nodes, and the three gates (Main, Pioneer Rd N, Jalan Bahar) with isExit = true (FR 2.1, 2.2). Each location gets at least one PickupPoint typed BUS_STOP or CARPARK with walkDistanceM (FR 2.3-2.5).
3. scripts/geocode-catalog.ts: for locations without verified coordinates, call the Google Geocoding API (key from env) and write a reviewable JSON/CSV file. A human checks it before it is added to prisma/data/.
4. Seed must be idempotent: running it twice changes nothing.

RULES:
- NEVER invent coordinates. If a location is not verified, leave it out of the seed.
- The Google key lives only in .env; the script must refuse to run without it and must never print it.

TESTS TO WRITE:
- Run the seed twice; row counts are identical. A test asserts exactly 2 fare tiers and exactly 3 locations with isExit = true.

READ FIRST:
- Labs/lab1/campus_location_catalog.md
- FR 2.1-2.5, 5.1.1, 5.1.2

DO NOT DO IN THIS TASK:
- The catalog is read-only in the app: there is no endpoint to edit it.

**Branch:** `feat/F6-seed-faretier-verified-campuslocations-geocoding`
**PR title:** `[F6] Seed (FareTier, verified CampusLocations) + geocoding script`
**Depends on:** F5
**Owns:** prisma/seed.ts, scripts/geocode-catalog.ts, prisma/data/**
**Traces to:** FR 2.1, FR 2.2, FR 2.3, FR 5.1.1, FR 5.1.2

**Watch out:** Never invent coordinates. Keep the Maps key out of the repo (Plan risk 7).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F7a] Entities: User, Driver, Passenger, DriverPreset' --label 'lane:L1,area:BE,wave:W1,size:M,tier:1' --body 'Task **F7a** (M, 2 pts)

**Done when:** Plain TypeScript classes with the operations from 04_design_class_model.puml (`lock`, `unlock`, `checkPassword`, `hasReachedDailyLimit`, ...); illegal moves throw `AppError`; unit tests cover every guard; no Express/Prisma imports (K10 enforces).

### Build brief

GOAL: Write the plain TypeScript domain classes for the account side. No Express, no Prisma: just rules and tests.

BUILD:
1. User (abstract): verifyEmail(code), checkPassword(plain) (bcryptjs compare), lock(reason), unlock(), updateAverageRating(avg); accountStatus changes only through lock/unlock.
2. Driver: incrementDailyTrips(), resetDailyTripCounter(), hasReachedDailyLimit() (true when dailyPaidTrips >= 2, FR 6.4).
3. Passenger: incrementCompletedRides(), incrementUnpaidCount(), isEligibleForTrustBooking() (needs completedRides >= 3, FR 10.3; the 75% balance test lives in WalletService).
4. DriverPreset: matchesPickupType(type), withinDetourTolerance(extraMin) (never true above 5, FR 3.1.4), confirmExemption() (FR 3.1.6, sets exemptionConfirmed).
5. Each class has a static fromRecord(row) and toRecord() so repositories/services map to and from Prisma rows without the entity importing Prisma.

RULES:
- Illegal calls throw AppError with a code from the catalog, e.g. unlock() on an ACTIVE user is ILLEGAL_STATE_TRANSITION.
- DriverPreset construction rejects a tolerance above 5 or an empty pickup-type list with VALIDATION_ERROR.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
ILLEGAL_STATE_TRANSITION, VALIDATION_ERROR

TESTS TO WRITE:
- One unit test per method and per guard; boundary tests: dailyPaidTrips 1 and 2, completedRides 2 and 3, tolerance 5 and 6.

READ FIRST:
- lab2/v2/vp/plantuml/04_design_class_model.puml
- FR 1.5, 1.6, 3.1.x, 6.4, 6.10, 10.3

DO NOT DO IN THIS TASK:
- Database access, HTTP, password hashing at registration (A2).

**Branch:** `feat/F7a-entities-user-driver-passenger-driverpreset`
**PR title:** `[F7a] Entities: User, Driver, Passenger, DriverPreset`
**Depends on:** F2, K3
**Owns:** server/src/entities/User.ts, server/src/entities/Driver.ts, server/src/entities/Passenger.ts, server/src/entities/DriverPreset.ts
**Traces to:** FR 1.5, FR 1.6, FR 3.1, FR 6.4, FR 6.10, Lab3 §3.1.4

**Watch out:** Plan risk 3. Add `passwordHash` to the entity (the design model was fixed on 12 Oct).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F7b] Entities: Journey, Route, HopRequest, Booking, FareTier, MatchResultSet' --label 'lane:L2,area:BE,wave:W1,size:M,tier:1' --body 'Task **F7b** (M, 2 pts)

**Done when:** State machines A (Journey) and B (Booking) are enforced: `goLive/open/start/complete/cancel/expire` and `confirm/cancel/complete/updatePickupStatus`; every forbidden transition throws `ILLEGAL_STATE_TRANSITION` and has a test; `FareTier.calculateFare` matches FR 5.1.

### Build brief

GOAL: Write the domain classes for journeys, requests and bookings, including the two state machines that must never be bypassed.

BUILD:
1. Journey: goLive(), open(), decrementSeats(), incrementSeats(), start(), complete(), cancel(reason), expire(), isFull(). Transitions: LIVE -> OPEN -> FULL (and back to OPEN when a seat frees), LIVE/OPEN/FULL -> IN_PROGRESS -> COMPLETED, LIVE/OPEN/FULL -> CANCELLED(reason), LIVE -> EXPIRED.
2. Booking: confirm(), cancel(), complete(), updatePickupStatus(next), markUnpaid(), reorderPickups(order), isSettled(). Pickup statuses move WAITING -> APPROACHING -> ARRIVED -> PICKED_UP -> DROPPED_OFF, with NO_SHOW only from ARRIVED, UNPAID at completion.
3. HopRequest: resolve(booking), expire(), isOpen(). Route: recalculate(waypoints) stays a stub until B2 supplies the Maps adapter.
4. FareTier.calculateFare(riders): 1 rider = 300 cents, 2-3 riders = 200 cents each, 0 or more than 3 throws (FR 5.1.x). It only reads the table, so there is no setter (NFR-6.1: no surge pricing).
5. MatchResultSet.rank(strategy) and top(n); the strategy interface is declared here and implemented in B5b.

RULES:
- decrementSeats() at 0 throws SEAT_UNAVAILABLE. cancel() on IN_PROGRESS throws ILLEGAL_STATE_TRANSITION. A NO_SHOW before ARRIVED throws.
- Journey.start() requires at least one CONFIRMED booking (UC-12 precondition).

ERROR CODES TO USE (from server/src/errors/AppError.ts):
SEAT_UNAVAILABLE, ILLEGAL_STATE_TRANSITION

TESTS TO WRITE:
- A transition table test: every (from, to) pair is either allowed or throws ILLEGAL_STATE_TRANSITION.
- FareTier boundary tests at 1, 2, 3, 4 riders; seats tests at 0, 1 and full.

READ FIRST:
- lab2/v2/vp/plantuml/03a-03e dialog maps (state machines A and B)
- FR 3.4, 3.5, 5.3-5.7, 6.1, 6.7

DO NOT DO IN THIS TASK:
- Persistence and HTTP. These classes know nothing about either.

**Branch:** `feat/F7b-entities-journey-route-hoprequest-booking`
**PR title:** `[F7b] Entities: Journey, Route, HopRequest, Booking, FareTier, MatchResultSet`
**Depends on:** F2, K3
**Owns:** server/src/entities/Journey.ts, server/src/entities/Route.ts, server/src/entities/HopRequest.ts, server/src/entities/Booking.ts, server/src/entities/FareTier.ts, server/src/entities/MatchResultSet.ts
**Traces to:** FR 3.4, FR 3.5, FR 5.3, FR 5.4, FR 5.6, FR 5.7, FR 6.1, Lab3 §3.1.4

**Watch out:** Plan risk 3. FareTier is read-only data: no endpoint may edit it (NFR-6.1).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F7c] Entities: Wallet, WalletTransaction, Debt, Rating, Notification, LocationUpdate, QuickMessage, CampusLocation, PickupPoint' --label 'lane:L3,area:BE,wave:W1,size:M,tier:1' --body 'Task **F7c** (M, 2 pts)

**Done when:** `Wallet.hold/release/deduct/credit/hasSufficientBalance` never allow a negative balance (throws `INSUFFICIENT_BALANCE`); `Debt.applyFine/clear`; `Rating.validate` accepts 1-5; WalletTransaction and LocationUpdate expose no mutators (append-only); all tested.

### Build brief

GOAL: Write the domain classes for money, ratings, notifications and location. These guard the rules that most often break.

BUILD:
1. Wallet: hold(amount), release(amount), deduct(amount), credit(amount), hasSufficientBalance(amount). Keep balance and held separate: available = balance - held. Amounts are Money (cents) from K3.
2. WalletTransaction (type TOP_UP/HOLD/RELEASE/DEDUCT/PAYOUT/CREDIT, amount, bookingId) and LocationUpdate: constructor only, no mutators (append-only, FR 10.10).
3. Debt: applyFine(amount), clear(), isOutstanding(). Rating.validate() accepts 1-5 stars and an optional comment of at most 200 characters (FR 9.1, 9.1.1).
4. Notification.markRead(); QuickMessage holds only a template key (no free text, FR 8.7); CampusLocation.distanceTo(other) (haversine, metres); PickupPoint data holder.

RULES:
- hold above the available amount throws INSUFFICIENT_BALANCE; deduct above held is an internal error; no operation can leave a balance below 0 (NFR-3.3).
- A QuickMessage template must be one of the three in FR 8.6.1: AT_PICKUP, LATE_2MIN, CANT_FIND.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
INSUFFICIENT_BALANCE, VALIDATION_ERROR

TESTS TO WRITE:
- Property-style test: any random sequence of valid hold/release/deduct/credit calls keeps balance >= 0 and held <= balance.
- Rating 0, 1, 5, 6 and a 201-character comment.

READ FIRST:
- FR 8.6.1, 8.7, 9.1, 10.5, 10.7, 10.10
- lab2/v2/vp/plantuml/04_design_class_model.puml

DO NOT DO IN THIS TASK:
- Transactions across rows (WalletService in C2).

**Branch:** `feat/F7c-entities-wallet-wallettransaction-debt-rating`
**PR title:** `[F7c] Entities: Wallet, WalletTransaction, Debt, Rating, Notification, LocationUpdate, QuickMessage, CampusLocation, PickupPoint`
**Depends on:** F2, K3
**Owns:** server/src/entities/Wallet.ts, server/src/entities/WalletTransaction.ts, server/src/entities/Debt.ts, server/src/entities/Rating.ts, server/src/entities/Notification.ts, server/src/entities/LocationUpdate.ts, server/src/entities/QuickMessage.ts, server/src/entities/CampusLocation.ts, server/src/entities/PickupPoint.ts
**Traces to:** FR 9.1, FR 9.2, FR 10.5, FR 10.7, FR 10.10, Lab3 §3.1.4

**Watch out:** Plan risk 2. Money is cents via K3'\''s `Money`, never floats.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F8] Middleware: requireAuth, requireRole, requireUnlocked, ownership helper, validate' --label 'lane:L1,area:BE,wave:W1,size:M,tier:1' --body 'Task **F8** (M, 2 pts)

**Done when:** A missing/invalid token gives `AUTH_REQUIRED`/`INVALID_TOKEN`; `requireRole` checks the ACTIVE role from the token (a user acting as a passenger is refused on driver routes with `FORBIDDEN`); a LOCKED account gets `ACCOUNT_LOCKED`; `assertOwner` raises `FORBIDDEN`; `validate(schema)` turns a zod failure into `VALIDATION_ERROR`; sets `req.user.id` for the logger.

### Build brief

GOAL: Write the four middlewares every protected route uses.

BUILD:
1. requireAuth: reads the JWT from the httpOnly cookie, verifies it, loads the user id into req.user (and into the logger context). Missing cookie -> AUTH_REQUIRED; bad/expired token -> INVALID_TOKEN.
2. requireUnlocked: loads the account status; LOCKED -> ACCOUNT_LOCKED (FR 10.8). Use it only on booking/request routes; a locked user must still log in, view the wallet and cancel.
3. requireRole('\''DRIVER'\'' | '\''PASSENGER'\''): see the role rule below; otherwise FORBIDDEN.
4. assertOwner(resourceOwnerId, req.user.id) helper: throws FORBIDDEN (do this on the server, never trust the client).
5. validate({ body?, query?, params? }): runs the zod schemas from K1 and throws VALIDATION_ERROR with details listing the failing fields.
6. requireRole('\''DRIVER'\'' | '\''PASSENGER'\'') checks the session'\''s ACTIVE role from the JWT (req.user.activeRole), and that the matching profile exists. Holding a role is not enough: a user who holds both but is acting as a passenger gets FORBIDDEN on driver routes. requireAnyRole is for role-neutral routes (wallet, history, ratings, notifications).

RULES:
- NTU email must be verified before going live or booking (NFR-2.1): requireVerified throws EMAIL_NOT_VERIFIED.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
AUTH_REQUIRED, INVALID_TOKEN, ACCOUNT_LOCKED, FORBIDDEN, VALIDATION_ERROR, EMAIL_NOT_VERIFIED

TESTS TO WRITE:
- supertest with a fake route per middleware: no cookie, tampered cookie, expired cookie (FakeClock), locked user, wrong role, wrong owner, bad body.
- A BOTH user with activeRole PASSENGER is refused on a driver route and allowed on a passenger route; with activeRole DRIVER the reverse; a single-role user is refused on the other role'\''s routes.

READ FIRST:
- FR 10.8, NFR-2.1, NFR-5.5, UC-7.EX.1
- server/src/errors/AppError.ts

**Branch:** `feat/F8-middleware-requireauth-requirerole-requireunlocked-ownership`
**PR title:** `[F8] Middleware: requireAuth, requireRole, requireUnlocked, ownership helper, validate`
**Depends on:** F3, K1, K2
**Owns:** server/src/middleware/requireAuth.ts, server/src/middleware/requireRole.ts, server/src/middleware/requireUnlocked.ts, server/src/middleware/ownership.ts, server/src/middleware/validate.ts
**Traces to:** UC-7.EX.1, NFR-2.1, NFR-5.5, FR 10.8

**Watch out:** Plan risk 11 (check ownership on the server, not just the client).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F9] Client scaffold: Vite + React + TS + PWA, router, guards, AuthContext' --label 'lane:L2,area:FE,wave:W0,size:M,tier:1' --body 'Task **F9** (M, 2 pts)

**Done when:** `npm run dev -w client` serves a mobile-first app with a PWA manifest; the router has one lazy route per screen (pages come from F15); `RequireAuth`, `RequireRole` (checks the ACTIVE role), `RequireUnlocked` exist, with a `/choose-role` route; `AuthContext` and a `RoleContext` load `/api/auth/me` (roles and active role).

### Build brief

GOAL: Scaffold the web client so every page task has a place to go.

BUILD:
1. Vite + React 18 + TypeScript in client/; PWA manifest and a placeholder service worker (offline shell comes later in Q4).
2. client/src/router.tsx: React Router with one lazy route per screen from the Plan tab (Login, Register, Home, Presets, Preset Editor, Location Permission, Live/Waiting, Request Hop, Match Results, Booking Detail, Wallet, Top-Up, Locked Account, Active Trip, Trip Complete, My Trips, Rate). Each route points at a stub page from F15. This file is a shared hot spot.
3. Guards: RequireAuth, RequireRole, RequireUnlocked (redirects to Locked Account). AuthContext loads GET /api/auth/me once and exposes user, roles, login, logout.
4. Mobile-first CSS at 375 px; nothing may need horizontal scrolling.
5. Add a /choose-role route and a RoleContext (from AuthContext: roles, activeRole, switchRole(role)). RequireRole checks the ACTIVE role; if the user holds both roles and activeRole is null, every guarded route redirects to /choose-role.
6. Add a /notifications route (page from F15) next to the others; the header bell links to it.

RULES:
- Geolocation only works over HTTPS or localhost, so use the deployed preview from F14 for real GPS tests (Plan risk 9).
- Pages never call fetch directly: they use the API layer from K9 (K10 will fail the build otherwise).

TESTS TO WRITE:
- npm run dev -w client serves the app; every route renders its stub; a logged-out user is redirected to Login.

READ FIRST:
- Plan tab: screen contents table
- NFR-4.1, NFR-4.2 (2 screens from home to Go Live)

DO NOT DO IN THIS TASK:
- Page content (lane tasks).
- Component library (K8).

**Branch:** `feat/F9-client-scaffold-vite-react-ts`
**PR title:** `[F9] Client scaffold: Vite + React + TS + PWA, router, guards, AuthContext`
**Depends on:** nothing
**Owns:** client/package.json, client/vite.config.ts, client/index.html, client/src/main.tsx, client/src/router.tsx, client/src/guards/**, client/src/auth/**
**Traces to:** Lab3 §3.4.1, SRS §2.4

**Watch out:** Plan risk 9 (geolocation needs HTTPS, so test on a deployed preview).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F12a] Mockups (L1): Choose Role, Home hub with role switch, Locked Account' --label 'lane:L1,area:DESIGN,wave:W0,size:M,tier:1' --body 'Task **F12a** (M, 2 pts)

**Done when:** Phone-width mockups for the three screens (Choose Role with '\''Continue as Driver / Passenger'\''; Home with the role chip and Switch control; Locked Account), using the contents listed in the Plan tab screen table, committed as PNG or SVG.

### Build brief

GOAL: Draw the two missing phone-width mockups for lane 1.

BUILD:
1. Home hub: role-aware (driver sees Go Live and presets, passenger sees Request Hop), wallet balance chip, notification bell, and the debt banner when LOCKED (UC-2).
2. Locked Account: shows the outstanding amount, why the account is locked, and a Top Up button (UC-20, FR 10.9). Include the simulated-payment label.
3. Choose Role: two large buttons, '\''Continue as Driver'\'' and '\''Continue as Passenger'\'', shown only to users who hold both roles, with the last used one highlighted; a one-line note that the choice can be changed from Home unless a trip is in progress.
4. Home: a role chip in the header showing the active role with a Switch control (disabled with a reason while on a trip).

RULES:
- One primary action per screen; destructive actions behind a confirmation (SRS UI constraints).
- Show system status (balance, role) always visible.

TESTS TO WRITE:
- Each screen is one PNG/SVG at 375 px width, committed under docs/mockups/L1/, and a teammate can build it without asking questions.

READ FIRST:
- SRS section 2 (UI constraints)
- UC-2, UC-20

**Branch:** `docs/F12a-mockups-l1-choose-role-home`
**PR title:** `[F12a] Mockups (L1): Choose Role, Home hub with role switch, Locked Account`
**Depends on:** nothing
**Owns:** docs/mockups/L1/**
**Traces to:** UC-2, UC-20, Lab2 §3.3.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F12b] Mockups (L2): Presets, Preset Editor, Location Permission, Live/Waiting, Cancelled Notice' --label 'lane:L2,area:DESIGN,wave:W0,size:M,tier:1' --body 'Task **F12b** (M, 2 pts)

**Done when:** Five phone-width mockups matching the Plan tab screen contents; the Preset Editor shows every field in FR 3.1.1-3.1.4 and 3.1.6.

### Build brief

GOAL: Draw the five lane-2 mockups.

BUILD:
1. Presets list and Preset Editor with every field: exit gate (3 gates), plan SOLO/SHARING (up to 3 seats), allowed pickup types, detour tolerance (max 5), optional schedule, and the exemption declaration checkbox (FR 3.1.1-3.1.6).
2. Location Permission explainer (why the geofence needs it), Live/Waiting with request cards arriving, Cancelled Notice (reason DRIVER, GEOFENCE or EXPIRED).

RULES:
- Tolerance control cannot exceed 5; declaration text must be explicit that the trip is one the driver would make anyway.

TESTS TO WRITE:
- Five files under docs/mockups/L2/ that match the dialog map screens.

READ FIRST:
- UC-3, UC-4, UC-5
- 03a-03e dialog maps

**Branch:** `docs/F12b-mockups-l2-presets-preset-editor`
**PR title:** `[F12b] Mockups (L2): Presets, Preset Editor, Location Permission, Live/Waiting, Cancelled Notice`
**Depends on:** nothing
**Owns:** docs/mockups/L2/**
**Traces to:** UC-3, UC-4, UC-5, Lab2 §3.3.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F12c] Mockups (L3): Booking Detail, Wallet, Top-Up, My Trips, Rate User' --label 'lane:L3,area:DESIGN,wave:W0,size:M,tier:1' --body 'Task **F12c** (M, 2 pts)

**Done when:** Five mockups; Top-Up carries an unmissable '\''simulated'\'' banner (FR 10.11); Booking Detail shows the balance banner states (FR 10.2-10.4).

### Build brief

GOAL: Draw the five lane-3 mockups.

BUILD:
1. Booking Detail: driver name, rating, payment-history indicator, pickup point, walking distance, pickup time, current fare, and the balance banner in its three states (Enough, Booked on trust, Not enough with Confirm disabled) (FR 5.10, 10.2-10.4).
2. Wallet (balance, held, shortfall), Top-Up with an unmissable SIMULATED banner (FR 10.11), My Trips (reverse chronological, NO_SHOW and UNPAID visible), Rate User (stars, 200-char comment).

RULES:
- Wallet screens are for every user now, so show the driver view (earnings credited) as a variant (13 Oct decision).

TESTS TO WRITE:
- Files under docs/mockups/L3/; the three banner states are drawn separately.

READ FIRST:
- UC-7, UC-19, UC-20
- FR 10.x

**Branch:** `docs/F12c-mockups-l3-booking-detail-wallet`
**PR title:** `[F12c] Mockups (L3): Booking Detail, Wallet, Top-Up, My Trips, Rate User`
**Depends on:** nothing
**Owns:** docs/mockups/L3/**
**Traces to:** UC-7, UC-19, UC-20, Lab2 §3.3.1

**Watch out:** Plan risk 16.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F12d] Mockups (L4): passenger Active Trip, Trip Complete, quick-message sheet, Notifications' --label 'lane:L4,area:DESIGN,wave:W0,size:M,tier:1' --body 'Task **F12d** (M, 2 pts)

**Done when:** Three mockups including the stale-location (15 s) and low-accuracy (50 m) banners and the three predefined messages from FR 8.6.1.

### Build brief

GOAL: Draw the three lane-4 mockups.

BUILD:
1. Passenger Active Trip: map with the driver'\''s live position, ETA and distance to my pickup, status chip (WAITING / APPROACHING / ARRIVED), quick-message button.
2. States to draw: stale location after 15 s (NFR-1.5) and low accuracy worse than 50 m (NFR-1.6).
3. Quick-message sheet with exactly three options (FR 8.6.1), and Trip Complete with the rating prompt and sharing-stops notice.
4. Notifications list: unread dot per row, Mark all as read, push on/off toggle, empty state (UC-22). The bell with its unread badge appears in the header of every screen.

RULES:
- No free-text input anywhere (FR 8.7).

TESTS TO WRITE:
- Three files under docs/mockups/L4/.

READ FIRST:
- UC-14, UC-15, UC-16
- FR 7.x, 8.6.1

**Branch:** `docs/F12d-mockups-l4-passenger-active-trip`
**PR title:** `[F12d] Mockups (L4): passenger Active Trip, Trip Complete, quick-message sheet, Notifications`
**Depends on:** nothing
**Owns:** docs/mockups/L4/**
**Traces to:** UC-15, UC-16, UC-14, Lab2 §3.3.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F14] Hello-world on the real hosts (client, API, database)' --label 'lane:L1,area:INFRA,wave:W1,size:M,tier:1' --body 'Task **F14** (M, 2 pts)

**Done when:** A deployed page calls a deployed API that reads a deployed database over HTTPS; login cookies work (one origin or SameSite=None;Secure proven); a Socket.IO connection succeeds through whatever sits in front.

### Build brief

GOAL: Prove the whole chain works on the real hosts before any feature is built on top.

BUILD:
1. Deploy the client, the API and a Postgres database to the chosen hosts (see the Plan tab); the page loads over HTTPS and calls GET /api/health.
2. Prove cookies: log in on the deployed client and see the httpOnly cookie sent back. Use one origin (a reverse proxy/rewrite) or SameSite=None; Secure with explicit CORS.
3. Prove WebSocket: a Socket.IO client connects through whatever sits in front, and survives an idle minute.
4. Write down in deploy/README.md: URLs, env vars needed, how to redeploy, free-tier sleep/expiry rules and what happens on demo day.

RULES:
- Check each host'\''s idle sleep and database expiry against the demo date (Plan risks 5, 6, 9).

TESTS TO WRITE:
- A teammate on a phone opens the deployed URL, allows location, and the health call succeeds.

READ FIRST:
- Plan tab: hosting section and risks 5, 6, 9
- NFR-2.3, NFR-3.2

**Branch:** `feat/F14-hello-world-on-the-real`
**PR title:** `[F14] Hello-world on the real hosts (client, API, database)`
**Depends on:** F3, F9
**Owns:** deploy/**, vercel.json, render.yaml
**Traces to:** NFR-2.3, NFR-3.2

**Watch out:** Plan risks 5, 6, 9. Check each host'\''s idle and expiry policy against the demo date.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[F15] Full skeleton stubs merged to dev' --label 'lane:L1,area:BE,wave:W1,size:L,tier:1' --body 'Task **F15** (L, 4 pts)

**Done when:** Every controller, service, route, job and page file exists with typed signatures and TODO bodies; each route returns 501 `NOT_IMPLEMENTED` in the standard error shape; route registration is one line per package; TSDoc on every class and key method; the build passes. Names come from lab2/v2/vp/java/ and the design class model.

### Build brief

GOAL: Create every file the lanes will fill in, as typed stubs, so nobody invents structure or edits the same file.

BUILD:
1. For each class in the design model make the controller, service and route file with typed method signatures and TODO bodies. Every route handler throws new AppError('\''NOT_IMPLEMENTED'\'') (501) so the app runs and shows what is missing.
2. Register one route per package in routes/index.ts (one line each) and one job file per sweep in jobs/ and one handler per realtime event group in realtime/handlers/.
3. Client: one stub page per screen with its route, one api/endpoints/*.ts per endpoint group (typed from K1) and empty hooks.
4. Put a TSDoc comment on every class and key method saying which use case and FR it implements, and which exceptions (UC-n.EX.m) it must raise. This is also what the Lab 3 section 3.4 skeleton asks for.
5. Names come from lab2/v2/vp/java/ and the design model. The results of the team'\''s own AI skeleton exercise (X5a) feed this.

RULES:
- This task gates all of A-E. Merge it to dev as early as possible and announce it.
- Do not implement behaviour here beyond signatures.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
NOT_IMPLEMENTED

TESTS TO WRITE:
- npm run build and typecheck pass; every route returns 501 in the standard error shape; a test enumerates the router and fails if a stub file is missing.

READ FIRST:
- Lab 3 manual sections 3.4.1-3.4.3
- lab2/v2/vp/java/
- K1 endpoint table

**Branch:** `feat/F15-full-skeleton-stubs-merged-to`
**PR title:** `[F15] Full skeleton stubs merged to dev`
**Depends on:** F3, F7a, F7b, F7c, F9, K1, X5a
**Owns:** server/src/controllers/**, server/src/services/**, server/src/routes/*.routes.ts, server/src/jobs/*.job.ts, server/src/realtime/handlers/**, client/src/pages/auth/**, client/src/pages/home/**, client/src/pages/locked/**, client/src/pages/driver/**, client/src/pages/notice/**, client/src/pages/hop/**, client/src/pages/booking/**, client/src/pages/wallet/**, client/src/pages/trips/**, client/src/api/endpoints/*.ts
**Traces to:** Lab3 §3.4.1, Lab3 §3.4.2, Lab3 §3.4.3

**Watch out:** Gates every A-E task. Waits on the team'\''s own section 3.3.3 AI exercise (X5a).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K1] API contract + shared types (shared/ workspace)' --label 'lane:L1,area:BE,wave:W0,size:M,tier:1' --body 'Task **K1** (M, 2 pts)

**Done when:** A `shared/` workspace exports zod schemas for every request and response, the status enums and `ErrorCode`; an endpoint table lists method, path, auth, request, response and error codes; client and server both import from it; L2 has reviewed it.

### Build brief

GOAL: Write the API contract once, in code, so frontend and backend agree before anyone builds.

BUILD:
1. Create a shared/ workspace exporting zod schemas for every request and response, the enums from F5, ErrorCode, and inferred TypeScript types. Both server and client import from it.
2. Endpoint table (proposal; the team agrees it in review before F15). Auth: POST /api/auth/register|verify|resend|login|logout, GET /api/auth/me. Driver: PUT /api/driver/profile, GET|POST /api/presets, PUT|DELETE /api/presets/:id. Catalog: GET /api/locations. Journeys: POST /api/journeys (go live from presetId), GET /api/journeys/mine, POST /api/journeys/:id/cancel, POST /api/journeys/:id/position, POST /api/journeys/:id/start, POST /api/journeys/:id/complete, GET /api/journeys/:id/requests.
3. Requests and bookings: POST /api/hop-requests, GET /api/hop-requests/:id/matches, GET /api/bookings/preview, POST /api/bookings, POST /api/bookings/:id/accept|decline|cancel, POST /api/bookings/:id/pickup-status, POST /api/bookings/:id/messages, POST /api/bookings/:id/ratings. Wallet: GET /api/wallet, POST /api/wallet/top-up, GET /api/wallet/transactions. Other: GET /api/notifications, POST /api/notifications/:id/read, GET /api/history.
4. Realtime events (K7): room journey:<id> carries location:update, pickup:status, journey:status, message:new; room user:<id> carries notification:new.
5. Each table row states: method, path, auth (public/user/driver/passenger), request schema, response schema, error codes it can return (from ERROR_CATALOG).
6. Role endpoints: POST /api/me/active-role and POST /api/me/roles; GET /api/auth/me returns roles and activeRole. Each endpoint row also states which ACTIVE role may call it: driver, passenger, or any (see Plan tab: Roles and permissions).
7. Notification management endpoints for UC-22: POST /api/notifications/read-all, GET and PUT /api/notifications/preferences { push } (role: any).

RULES:
- Money is always integer cents in the contract (amountCents). Times are ISO-8601 UTC strings.
- A new server error code must also appear in the shared ErrorCode type.

TESTS TO WRITE:
- A type test: every endpoint in the table has both schemas; a contract test hits each route stub and checks the error shape.

READ FIRST:
- 04_design_class_model.puml
- SRS section 4 (all FRs)
- server/src/errors/AppError.ts

**Branch:** `feat/K1-api-contract-shared-types-shared`
**PR title:** `[K1] API contract + shared types (shared/ workspace)`
**Depends on:** nothing
**Owns:** shared/**
**Traces to:** Lab3 §3.4.1, Lab3 §3.4.2

**Watch out:** Everything FE-side is inferred from this, so agree the endpoint table before F15.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K2] Config (zod, fail-fast), pino logger, request-id and request-log middleware' --label 'lane:L1,area:BE,wave:W0,size:S,tier:1' --body 'Task **K2** (S, 1 pts)

**Done when:** A missing or invalid env var stops startup with a readable message; every request logs method, path, status, requestId and userId; the existing handler uses the pino logger.

### Build brief

GOAL: One way to configure and log the server.

BUILD:
1. server/src/config/env.ts: parse process.env with zod once at startup (DATABASE_URL, JWT_SECRET, COOKIE settings, SMTP, GOOGLE_MAPS_API_KEY, CAMPUS_BOUNDARY, GEOFENCE_GRACE_M, LIVE_WINDOW_MIN, SHARING_STOP_SECONDS=30, PROXIMITY_M=300). Invalid or missing values stop the process with a readable list.
2. server/src/logging/logger.ts: pino logger; requestLogger middleware assigns a requestId, logs method, path, status, duration and userId; the error handler logs with the same id.
3. Provide .env.example listing every variable with a harmless sample value.

RULES:
- Never log passwords, codes, tokens or the Maps key. Redact authorization and cookie headers.

TESTS TO WRITE:
- Unit test: missing JWT_SECRET exits with a message naming it; a request log line contains the requestId that the error response also returns.

READ FIRST:
- FR 3.8.1 (configurable boundary), FR 7.7, 7.12

DO NOT DO IN THIS TASK:
- Secrets management beyond .env.

**Branch:** `feat/K2-config-zod-fail-fast-pino`
**PR title:** `[K2] Config (zod, fail-fast), pino logger, request-id and request-log middleware`
**Depends on:** nothing
**Owns:** server/src/config/**, server/src/logging/**
**Traces to:** Lab3 §3.4.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K3] Clock, Money, Prisma singleton, withTransaction' --label 'lane:L3,area:BE,wave:W1,size:M,tier:1' --body 'Task **K3** (M, 2 pts)

**Done when:** `Clock` (+`FakeClock`), `Money` (integer cents, no float math), one Prisma client, and `withTransaction(fn)`; tests prove an error inside a transaction rolls everything back.

### Build brief

GOAL: Build the four helpers that make money, time and transactions safe everywhere else.

BUILD:
1. Clock interface with now(); SystemClock and FakeClock (advance(ms)). Never call new Date() in services or entities.
2. Money: integer cents value object with add, sub, gt, fromDollars, format(); throws on a non-integer or negative result where meaningless. No floats.
3. prisma.ts: ONE PrismaClient for the process (and a way to swap it in tests).
4. withTransaction(fn): runs fn(tx) inside prisma.$transaction; rolls everything back if fn throws; helper for SELECT ... FOR UPDATE row locks (needed for seats and wallets).

RULES:
- Seat counts and wallet balances must never go negative under concurrent requests (NFR-3.1, NFR-3.3): conditional updates or row locks, not read-then-write.

TESTS TO WRITE:
- Test: an error thrown inside withTransaction leaves no rows written.
- Test: two concurrent decrements on a 1-seat journey -> exactly one succeeds.

READ FIRST:
- Plan tab risks 1, 2 and 20
- NFR-3.1, NFR-3.3, NFR-3.4

**Branch:** `feat/K3-clock-money-prisma-singleton-withtransaction`
**PR title:** `[K3] Clock, Money, Prisma singleton, withTransaction`
**Depends on:** nothing
**Owns:** server/src/core/**
**Traces to:** NFR-3.1, FR 10.10, Lab4 §3.2.3

**Watch out:** Plan risks 1, 2 and 20.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K4] Test infrastructure: vitest, test database, factories, supertest helpers' --label 'lane:L3,area:QA,wave:W1,size:M,tier:1' --body 'Task **K4** (M, 2 pts)

**Done when:** `npm test` runs server and client suites; a separate test database is reset between suites; `makeUser()`, `makeJourney()` etc. exist; coverage prints.

### Build brief

GOAL: Make testing one command and give everyone the same helpers.

BUILD:
1. Vitest workspaces for server, client and shared; npm test runs all, npm run test:server etc. run one.
2. Test database: a separate Postgres schema or container; a beforeEach helper truncates tables; migrations apply once per run.
3. Factories: makeUser(), makeDriver(), makePassenger(), makePreset(), makeJourney(), makeBooking(), makeWallet() with sensible defaults and overrides.
4. Supertest helper api(app).asUser(user) that sets the auth cookie; helper to freeze time with FakeClock.
5. Coverage report (vitest --coverage) printed in CI.

RULES:
- Tests never call real email, Maps or PayNow: they use the K5 fakes.

TESTS TO WRITE:
- A sample test for each layer passes: entity unit, service with DB, route with supertest, React component.

READ FIRST:
- Lab 4 manual sections 3.2.1 and 3.2.4

**Branch:** `feat/K4-test-infrastructure-vitest-test-database`
**PR title:** `[K4] Test infrastructure: vitest, test database, factories, supertest helpers`
**Depends on:** nothing
**Owns:** vitest.workspace.ts, server/test/**, client/test/**
**Traces to:** Lab4 §3.2.1, Lab4 §3.2.4

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K5] Adapter interfaces + in-memory fakes (Email, Maps, PayNow sim, Push, GPS)' --label 'lane:L4,area:BE,wave:W1,size:M,tier:1' --body 'Task **K5** (M, 2 pts)

**Done when:** One interface and one in-memory fake per external system, selected by config; no real key or mail server is needed to run the app or the tests.

### Build brief

GOAL: Define each outside system as an interface with an in-memory fake, so the app runs with no keys.

BUILD:
1. Interfaces in server/src/adapters/: EmailAdapter.send(to, subject, body), MapsAdapter.route(from, to, departAt) and .walkingDistance(a, b), PayNowAdapter.simulateTopUp(userId, cents) and .simulatePayout(userId, cents), PushAdapter.send(userId, payload), GpsSource (used by the replay tool).
2. One in-memory fake per interface that records calls (so tests can assert on them) and can be told to fail (failNext()).
3. adapters/index.ts picks real vs fake from config. Real implementations live in A1 (email), B2 (maps), C2 (PayNow sim), D3 (push).

RULES:
- Every failure of a real adapter must surface as EXTERNAL_SERVICE_UNAVAILABLE (UC-4.EX.2, UC-6.EX.1, and the notification and email delivery rules in FR 8).

ERROR CODES TO USE (from server/src/errors/AppError.ts):
EXTERNAL_SERVICE_UNAVAILABLE

TESTS TO WRITE:
- Each fake has a unit test for failNext().

READ FIRST:
- UC-1 (verification email), UC-6, FR 8.2, FR 10.11

**Branch:** `feat/K5-adapter-interfaces-in-memory-fakes`
**PR title:** `[K5] Adapter interfaces + in-memory fakes (Email, Maps, PayNow sim, Push, GPS)`
**Depends on:** nothing
**Owns:** server/src/adapters/*.ts
**Traces to:** UC-1, UC-6, FR 8.2, FR 10.11, Lab3 §3.4.2

**Watch out:** Real implementations live in subfolders owned by A1, B2, C2, D3.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K6] Typed domain event bus + job runner' --label 'lane:L4,area:BE,wave:W1,size:M,tier:2' --body 'Task **K6** (M, 2 pts)

**Done when:** Events such as `JourneyCancelled`, `BookingConfirmed`, `AccountLocked` are typed; `scheduleSweep(name, ms, fn)` never overlaps itself and routes failures through `normalizeError`; tested with `FakeClock`.

### Build brief

GOAL: Build the event bus and the safe job runner that notifications and timers rely on.

BUILD:
1. Typed in-process event bus (on(event, handler), emit(event, payload)) with events: BookingRequested, BookingConfirmed, BookingDeclined, BookingCancelled, JourneyCancelled, JourneyExpired, TripStarted, PickupStatusChanged, TripCompleted, FareChanged, AccountLocked, AccountUnlocked, DebtRecorded, MessageSent.
2. scheduleSweep(name, intervalMs, fn) in jobs/runner.ts: never overlaps itself (skip a tick if the last run is still going), catches errors, logs them through normalizeError, and never lets an exception kill the process.
3. Handlers run after the main transaction commits, so a failing notification cannot roll back a booking.

RULES:
- This is the Observer pattern named in the design model: services emit, NotificationService (D3) listens.

TESTS TO WRITE:
- Test with FakeClock: a sweep that throws once keeps running; a slow sweep is not started twice.

READ FIRST:
- Plan tab risk 4
- FR 8.1-8.11 (notifications are steps inside each flow, not a use case)

**Branch:** `feat/K6-typed-domain-event-bus-job`
**PR title:** `[K6] Typed domain event bus + job runner`
**Depends on:** nothing
**Owns:** server/src/events/**, server/src/jobs/runner.ts
**Traces to:** FR 8.2, FR 8.3, Lab3 §3.2.2

**Watch out:** Plan risk 4. This is the Observer pattern the design model names.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K7] Realtime foundation: authed Socket.IO, room helpers, typed events, client hooks, replay-GPS tool' --label 'lane:L4,area:BE,wave:W1,size:M,tier:1' --body 'Task **K7** (M, 2 pts)

**Done when:** The socket handshake rejects unauthenticated clients; room names come from one helper; the event map is typed; `useLiveLocation(journeyId)` and `useNotifications()` exist on the client; a script replays a recorded GPS path into a journey room so tracking can be built from a desk.

### Build brief

GOAL: Build the realtime plumbing for tracking, plus a tool to fake GPS so tracking can be built from a desk.

BUILD:
1. Socket.IO server in realtime/server.ts: handshake reads the same JWT cookie; unauthenticated sockets are refused.
2. rooms.ts: the only place room names are built (journey:<id>, user:<id>); events.ts: typed event map shared with the client.
3. Client: useLiveLocation(journeyId) (position, accuracy, ageSeconds) and useNotifications() hooks.
4. tools/replay-gps/: a script that reads a recorded path (JSON of lat/lng) and emits location:update every 5 s into a journey room as the driver.

RULES:
- Joining a journey room is NOT decided here: D2 checks the user is the driver or a CONFIRMED passenger (NFR-5.5).

ERROR CODES TO USE (from server/src/errors/AppError.ts):
AUTH_REQUIRED

TESTS TO WRITE:
- Test: socket without cookie is rejected; two clients in the same room both receive an emitted event.

READ FIRST:
- NFR-1.4, NFR-5.5, UC-15

**Branch:** `feat/K7-realtime-foundation-authed-socket-io`
**PR title:** `[K7] Realtime foundation: authed Socket.IO, room helpers, typed events, client hooks, replay-GPS tool`
**Depends on:** nothing
**Owns:** server/src/realtime/server.ts, server/src/realtime/rooms.ts, server/src/realtime/events.ts, client/src/realtime/**, tools/replay-gps/**
**Traces to:** UC-15, FR 7.3, NFR-1.4, NFR-5.5

**Watch out:** Plan risks 11 and 22.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K8] Frontend component kit + /dev/components gallery' --label 'lane:L2,area:FE,wave:W1,size:M,tier:1' --body 'Task **K8** (M, 2 pts)

**Done when:** Design tokens and about 12 components (Button, Field, Card, StatusChip, Banner, EmptyState, ConfirmDialog, Toast, Spinner, MapView wrapper, ...) with a gallery page; usable at 375 px width.

### Build brief

GOAL: Build the small set of shared UI components so every page looks the same.

BUILD:
1. Design tokens (colours, spacing, type) as CSS variables with light and dark values.
2. About 12 components: Button, Field (label + input + error), Card, StatusChip (journey/booking/pickup statuses), Banner (info/warn/error, with a simulated variant), EmptyState, ConfirmDialog, Toast, Spinner, PageShell (title, back, bell), MapView wrapper, StarRating.
3. A gallery page at /dev/components showing every component in every state.

RULES:
- Touch targets at least 44 px; usable at 375 px; every input has a visible label.

TESTS TO WRITE:
- Component tests for ConfirmDialog (confirm/cancel) and Banner variants; gallery renders without errors.

READ FIRST:
- NFR-4.1, NFR-4.2
- Plan tab screen contents

**Branch:** `feat/K8-frontend-component-kit-dev-components`
**PR title:** `[K8] Frontend component kit + /dev/components gallery`
**Depends on:** F9
**Owns:** client/src/components/**, client/src/styles/**, client/src/pages/dev/**
**Traces to:** NFR-4.1, NFR-4.2, Lab2 §3.3.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K9] Frontend conventions: data fetching, forms, ApiError, error boundary, MSW mocks' --label 'lane:L2,area:FE,wave:W1,size:M,tier:1' --body 'Task **K9** (M, 2 pts)

**Done when:** TanStack Query is set up; a form pattern (react-hook-form + zod) exists; `ApiError` plus a table mapping every `ErrorCode` to a user sentence; an error boundary and toast; MSW handlers generated from the K1 contract.

### Build brief

GOAL: Make every page fetch, validate and fail the same way.

BUILD:
1. TanStack Query provider and a typed API client (api/client.ts) that sends cookies, parses the standard error shape into ApiError { code, message, requestId }.
2. api/errors.ts: a table from every ErrorCode to a friendly sentence. Make TypeScript fail the build if a code has no sentence (use satisfies Record<ErrorCode, string>).
3. Form pattern with react-hook-form + zod resolver using the schemas from K1; field errors from VALIDATION_ERROR.details.
4. Error boundary, global toast for unexpected errors, MSW mock handlers generated from the K1 contract so pages can be built before the backend exists.

RULES:
- Pages never call fetch directly.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
VALIDATION_ERROR

TESTS TO WRITE:
- Test: a 409 SEAT_UNAVAILABLE response shows its sentence; a missing sentence for a new code fails typecheck.

READ FIRST:
- server/src/errors/AppError.ts
- K1 endpoint table

**Branch:** `feat/K9-frontend-conventions-data-fetching-forms`
**PR title:** `[K9] Frontend conventions: data fetching, forms, ApiError, error boundary, MSW mocks`
**Depends on:** F9, K1
**Owns:** client/src/api/client.ts, client/src/api/errors.ts, client/src/forms/**, client/src/mocks/**
**Traces to:** Lab3 §3.4.1, Lab4 §3.1.3

**Watch out:** Mirror ERROR_CATALOG: a new server code must fail the build until it has a sentence.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K10] Quality gates: ESLint, Prettier, dependency-rule check, CI, Scantist' --label 'lane:L1,area:INFRA,wave:W0,size:M,tier:1' --body 'Task **K10** (M, 2 pts)

**Done when:** CI runs typecheck, lint and tests on every PR; a rule fails the build when an entity imports Express/Prisma, a controller imports Prisma, or a page calls fetch directly; a Scantist (SCA + SAST) report exists for the repo.

### Build brief

GOAL: Make bad structure fail the pull request automatically.

BUILD:
1. ESLint + Prettier + tsconfig.base.json shared by server, client and shared.
2. Dependency-rule check (eslint-plugin-boundaries or dependency-cruiser): entities may not import Express or Prisma; controllers may not import Prisma; pages may not call fetch.
3. GitHub Actions workflow: install, typecheck, lint, test (with the test database service) on every PR; required status check.
4. Run a Scantist scan (SCA + SAST, Lab 5 section 3.1.5) and save the report to docs/.

RULES:
- CI must be fast (under 5 minutes) or people will bypass it.

TESTS TO WRITE:
- Open a PR where an entity imports Prisma: CI fails.

READ FIRST:
- Lab 5 manual section 3.1.5
- Overview appendix

**Branch:** `feat/K10-quality-gates-eslint-prettier-dependency`
**PR title:** `[K10] Quality gates: ESLint, Prettier, dependency-rule check, CI, Scantist`
**Depends on:** F1
**Owns:** eslint.config.js, .prettierrc, tsconfig.base.json, .github/workflows/**
**Traces to:** Lab5 §3.1.5, Overview appendix

**Watch out:** Plan risk 29.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K11] Security baseline: helmet, CORS, rate limits, cookie flags, npm audit in CI' --label 'lane:L1,area:BE,wave:W1,size:S,tier:2' --body 'Task **K11** (S, 1 pts)

**Done when:** Login and verify endpoints return `TOO_MANY_REQUESTS` after repeated attempts; cookies are httpOnly + Secure + SameSite as decided in F14; CORS allows only the known origin; CI fails on a high-severity audit finding.

### Build brief

GOAL: Add the security basics once.

BUILD:
1. helmet, CORS locked to the client origin, cookie flags httpOnly; Secure; SameSite, body size limit.
2. Rate limits on login, register, verify and resend (return TOO_MANY_REQUESTS).
3. npm audit --audit-level=high in CI. Password hashing is bcryptjs in A2 (not here).

RULES:
- NFR-2.1, NFR-2.2, NFR-2.3.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
TOO_MANY_REQUESTS

TESTS TO WRITE:
- Test: the 11th login attempt in a minute is 429.

READ FIRST:
- NFR-2.1-2.3

**Branch:** `feat/K11-security-baseline-helmet-cors-rate`
**PR title:** `[K11] Security baseline: helmet, CORS, rate limits, cookie flags, npm audit in CI`
**Depends on:** K10
**Owns:** server/src/security/**
**Traces to:** NFR-2.1, NFR-2.2, NFR-2.3

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K12] Docs as code: ARCHITECTURE, ADRs, ERROR-CODES, API' --label 'lane:L3,area:DOCS,wave:W1,size:M,tier:3' --body 'Task **K12** (M, 2 pts)

**Done when:** ARCHITECTURE.md states the layers and the dependency rule; one short ADR per decision (PWA, JWT cookie, bcryptjs, Socket.IO, Prisma, simulated money) with the reason; ERROR-CODES.md and API.md are generated, not hand-written.

### Build brief

GOAL: Write down the decisions so nobody re-argues them.

BUILD:
1. ARCHITECTURE.md: layers (route -> controller -> service -> entity; adapters; events), folder map, and how a request flows through them.
2. ADRs (one page each): PWA over native, JWT httpOnly cookie, bcryptjs, Socket.IO, Prisma, simulated money. Format: context, decision, consequences.
3. ERROR-CODES.md and API.md generated from ERROR_CATALOG and the K1 table by a script.

RULES:
- Keep it short: one page per ADR.

TESTS TO WRITE:
- npm run docs regenerates both tables with no manual edits.

READ FIRST:
- Lab 3 section 3.1.2
- Lab 5 section 3.1.5

**Branch:** `docs/K12-docs-as-code-architecture-adrs`
**PR title:** `[K12] Docs as code: ARCHITECTURE, ADRs, ERROR-CODES, API`
**Depends on:** K1
**Owns:** docs/ARCHITECTURE.md, docs/adr/**, docs/ERROR-CODES.md, docs/API.md
**Traces to:** Lab5 §3.1.5, Lab3 §3.1.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K13] Traceability seed: docs/traceability.csv' --label 'lane:L4,area:DOCS,wave:W1,size:S,tier:3' --body 'Task **K13** (S, 1 pts)

**Done when:** Pre-filled UC -> FR -> class -> screen -> test id for all 21 use cases; the PR template asks the author to update their row.

### Build brief

GOAL: Create the traceability file and keep it current.

BUILD:
1. docs/traceability.csv with columns: UC, FR, class, endpoint, screen, test file, task id. Prefill the UC and FR columns from the SRS Appendix B.1 trace table.
2. Each PR adds the rows it touches (add a line to the PR template).

RULES:
- Every UC from 1 to 21 has at least one row.

TESTS TO WRITE:
- A script fails if any UC has no endpoint or no test.

READ FIRST:
- Lab 5 section 3.1.6
- SRS Appendix B.1

**Branch:** `docs/K13-traceability-seed-docs-traceability-csv`
**PR title:** `[K13] Traceability seed: docs/traceability.csv`
**Depends on:** nothing
**Owns:** docs/traceability.csv
**Traces to:** Lab5 §3.1.6, Lab4 §3.5.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K14] One-command dev environment' --label 'lane:L1,area:INFRA,wave:W0,size:S,tier:1' --body 'Task **K14** (S, 1 pts)

**Done when:** `npm run dev` starts Postgres + Mailpit in Docker, the API and the client; `npm run reset-db` and `npm run seed` work; a teammate follows the README on a second machine and is running in 10 minutes.

### Build brief

GOAL: Make one command start everything on a fresh machine.

BUILD:
1. docker-compose.yml with Postgres and Mailpit (SMTP catcher with a web inbox).
2. Root scripts: npm run dev (db + API with reload + client), npm run reset-db, npm run seed. .env.example copied to .env by a postinstall hint.
3. README section '\''Run it in 10 minutes'\'', verified on a second teammate'\''s machine.

RULES:
- No secret keys needed to run: the K5 fakes are the default.

TESTS TO WRITE:
- A teammate who has never seen the repo runs the README and sees the login page.

READ FIRST:
- Lab 3 section 3.4.4

**Branch:** `feat/K14-one-command-dev-environment`
**PR title:** `[K14] One-command dev environment`
**Depends on:** nothing
**Owns:** docker-compose.yml, .env.example, scripts/dev.*, .editorconfig
**Traces to:** Lab3 §3.4.4

**Watch out:** Plan risk 31: keep the working copy out of OneDrive.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[K15] Feature flags for cut-line features' --label 'lane:L2,area:BE,wave:W1,size:S,tier:3' --body 'Task **K15** (S, 1 pts)

**Done when:** Scheduled go-live, pickup re-ordering and quick messages can each be switched off by one config value, hiding the UI and refusing the endpoint with `NOT_IMPLEMENTED`.

### Build brief

GOAL: Add switches so cut-line features can be turned off without deleting code.

BUILD:
1. shared/flags.ts: scheduledGoLive, scheduledRequests, reorderPickups, quickMessages, pushNotifications, offlineShell; values from env, default on for Tier 1 features and off for the rest.
2. A server isEnabled(flag) and a client useFlag(flag); a disabled flag hides the UI and makes the endpoint return NOT_IMPLEMENTED.

RULES:
- Lab 4 allows demoing the main functionality only if the design stays complete, so a flagged-off feature must still exist in code and docs.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
NOT_IMPLEMENTED

TESTS TO WRITE:
- Test: flag off hides the button and the endpoint returns 501.

READ FIRST:
- Lab 4 manual section 2.5

**Branch:** `feat/K15-feature-flags-for-cut-line`
**PR title:** `[K15] Feature flags for cut-line features`
**Depends on:** nothing
**Owns:** shared/src/features.ts, client/src/features/**
**Traces to:** Lab4 §2.5

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[A1] EmailAdapter (real, Mailpit in dev)' --label 'lane:L1,area:BE,wave:W1,size:M,tier:1' --body 'Task **A1** (M, 2 pts)

**Done when:** Sends the verification code through SMTP; dev points at Mailpit; the provider is changed in one file; `EXTERNAL_SERVICE_UNAVAILABLE` on failure.

### Build brief

GOAL: Send the verification code by real email (Mailpit in development) behind the EmailAdapter interface.

BUILD:
1. Implement SmtpEmailAdapter in server/src/adapters/email/ using nodemailer: send(to, subject, body). Host, port, user and password come from env (K2). In dev they point at Mailpit; in production at a real provider.
2. Add a small template function verificationEmail(code, expiresInMin) returning subject + plain-text body ('\''Your Campus Hop code is 123456; it expires in 10 minutes'\'').
3. Selected through adapters/index.ts when EMAIL_PROVIDER=smtp; otherwise the K5 fake is used.

RULES:
- Any send failure becomes EXTERNAL_SERVICE_UNAVAILABLE (UC-1: the user is told to retry).
- Do not log the code or the full body.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
EXTERNAL_SERVICE_UNAVAILABLE

TESTS TO WRITE:
- Integration test against Mailpit'\''s HTTP API (or a nodemailer stub): one message sent, recipient correct, code present.
- Test: SMTP down -> EXTERNAL_SERVICE_UNAVAILABLE.

READ FIRST:
- UC-1 (verification email)
- FR 1.2, NFR-2.1
- Plan tab risk 8

DO NOT DO IN THIS TASK:
- Generating or checking the code (A2).

**Branch:** `feat/A1-emailadapter-real-mailpit-in-dev`
**PR title:** `[A1] EmailAdapter (real, Mailpit in dev)`
**Depends on:** K5
**Owns:** server/src/adapters/email/**
**Traces to:** UC-1, FR 1.2, NFR-2.1

**Watch out:** Plan risk 8: send a real code to a real @e.ntu.edu.sg inbox in week 1.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[A2] Auth service + controller: register, verify, resend, login, logout, me' --label 'lane:L1,area:BE,wave:W2,size:L,tier:1' --body 'Task **A2** (L, 4 pts)

**Done when:** Non-NTU domain -> `EMAIL_DOMAIN_NOT_ALLOWED`; the account is inactive until the correct code; 3 wrong codes -> `CODE_ATTEMPTS_EXCEEDED` and a resend; passwords stored with bcryptjs; login sets an httpOnly JWT cookie that carries the user'\''s roles and active role; `GET /api/auth/me` (roles, activeRole) and logout work.

### Build brief

GOAL: Build registration, email verification, login, logout and me. This is the front door every other feature depends on.

BUILD:
1. AuthService.register({name, ntuEmail, phone, password, role}): reject a domain outside @e.ntu.edu.sg / @ntu.edu.sg (FR 1.1); reject a duplicate email; hash the password with bcryptjs (salted, NFR-2.2); create User with accountStatus PENDING_VERIFICATION and the Driver and/or Passenger profile rows per role (FR 1.5); create the Wallet (13 Oct: every user has one, balance 0); create an EmailVerification row with a 6-digit code stored hashed and a 10-minute expiry; send the code through EmailAdapter (FR 1.2).
2. verify({email, code}): compare against the hash; on success set ACTIVE and mark the row consumed (FR 1.3). Each wrong code increments attempts; at 3 the code is invalidated and a resend is required.
3. resend({email}): new code, invalidates the old, rate-limited by K11.
4. login({email, password}): checkPassword; a LOCKED user can log in (UC-2); an unverified user cannot (EMAIL_NOT_VERIFIED). Sets an httpOnly, Secure, SameSite JWT cookie (userId, roles, expiry from Clock). logout clears it. GET /api/auth/me returns id, name, roles, accountStatus, wallet summary.
5. Controller methods only parse with validate, call the service and shape the response from K1.
6. Put roles and activeRole in the JWT and in me. A single-role user gets that role as activeRole; a user with both gets lastActiveRole or null (A6 handles choosing and switching).

RULES:
- Never reveal whether an email exists on login: wrong email and wrong password both return INVALID_CREDENTIALS (UC-2.EX.1).
- Never return passwordHash, the code or its hash in any response; never show a user'\''s NTU email to other users (NFR-5.2).

INTERFACE:
- POST /api/auth/register -> 201 { userId }
- POST /api/auth/verify { email, code } -> 200
- POST /api/auth/resend { email } -> 204
- POST /api/auth/login { email, password } -> 200 + Set-Cookie
- POST /api/auth/logout -> 204
- GET /api/auth/me -> 200 { user }

ERROR CODES TO USE (from server/src/errors/AppError.ts):
EMAIL_DOMAIN_NOT_ALLOWED, EMAIL_TAKEN, VERIFICATION_CODE_INVALID, CODE_ATTEMPTS_EXCEEDED, INVALID_CREDENTIALS, EMAIL_NOT_VERIFIED, VALIDATION_ERROR

TESTS TO WRITE:
- Domain check: a@gmail.com -> EMAIL_DOMAIN_NOT_ALLOWED. Duplicate -> EMAIL_TAKEN (UC-1.AC.1).
- Wrong code 1, 2, 3 times -> VERIFICATION_CODE_INVALID, VERIFICATION_CODE_INVALID, CODE_ATTEMPTS_EXCEEDED; after that the right code is also refused until resend.
- Expired code (FakeClock +11 min) -> VERIFICATION_CODE_INVALID.
- Login: wrong password -> INVALID_CREDENTIALS; locked account logs in with accountStatus LOCKED in me.
- Role BOTH creates both profile rows.
- Login of a both-role user with no remembered role returns activeRole: null; with a remembered role returns it.

READ FIRST:
- UC-1 and UC-2 (flows, AC and EX)
- FR 1, 1.1-1.5, NFR-2.1, NFR-2.2
- server/src/errors/AppError.ts

DO NOT DO IN THIS TASK:
- Vehicle plate, model and PayNow ID are NOT captured here (moved to UC-3, task B1).
- The login screen (A4).

**Branch:** `feat/A2-auth-service-controller-register-verify`
**PR title:** `[A2] Auth service + controller: register, verify, resend, login, logout, me`
**Depends on:** F5, F8, A1
**Owns:** server/src/services/AuthService.ts, server/src/controllers/AuthController.ts, server/src/routes/auth.routes.ts
**Traces to:** UC-1, UC-2, UC-1.EX.1, UC-1.EX.2, UC-2.EX.1, FR 1.1, FR 1.2, FR 1.3, FR 1.4, NFR-2.1, NFR-2.2

**Watch out:** Plan risks 8 and 17.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[A3] Auth tests (FakeClock, wrong code x3, domain check)' --label 'lane:L1,area:QA,wave:W2,size:M,tier:1' --body 'Task **A3** (M, 2 pts)

**Done when:** Tests cover each UC-1/UC-2 exception flow with the code the exception maps to; code expiry uses `FakeClock`; documented as Test Input / Expected / Actual rows for X4.

### Build brief

GOAL: Prove the authentication rules with tests, using a fake clock so expiry is testable.

BUILD:
1. Service-level tests with the K4 factories and FakeClock, plus route-level supertest tests for cookies.
2. Cover each UC-1/UC-2 exception and alternative: EX.1 domain, EX.2 three wrong codes, AC.1 duplicate email, EX.1 invalid credentials.
3. Cookie assertions: httpOnly and SameSite set; logout clears; a tampered cookie -> INVALID_TOKEN.

RULES:
- Each test is named after the rule it proves (UC-1.EX.2: third wrong code locks the code).

TESTS TO WRITE:
- A mutation check: comment out the attempts increment and a test must fail.
- Role claims: single-role login sets the role automatically; both-role login with no saved choice has activeRole null.

READ FIRST:
- UC-1, UC-2
- Lab 4 manual 3.2.4 (test case table)

**Branch:** `feat/A3-auth-tests-fakeclock-wrong-code`
**PR title:** `[A3] Auth tests (FakeClock, wrong code x3, domain check)`
**Depends on:** A2, K4
**Owns:** server/src/services/AuthService.test.ts, server/test/auth.int.test.ts
**Traces to:** UC-1.EX.1, UC-1.EX.2, UC-2.EX.1, Lab4 §3.2.4

**Watch out:** Plan risk 20.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[A4] FE: Register (with code step) + Login + Choose Role' --label 'lane:L1,area:FE,wave:W2,size:M,tier:1' --body 'Task **A4** (M, 2 pts)

**Done when:** Register collects name, NTU email, phone, password and role (driver, passenger or both), then a code-entry step; a user who holds both roles lands on Choose Role after login; Login shows the invalid-credentials error; every server error code shows its table sentence.

### Build brief

GOAL: Build the Register (with the code step) and Login screens.

BUILD:
1. Register: fields name, NTU email, phone, password, role (driver / passenger / both); on submit show the code-entry step with a resend link and a 3-attempt message; on success go to Home.
2. Login: email + password; link to Register; on success go to Home.
3. Use the K9 form pattern and K8 components; show server errors through the code-to-sentence table (domain not allowed, email taken, wrong code, attempts exceeded, wrong credentials).
4. Register role field: three options (Driver, Passenger, Both) with one line explaining that Both lets you switch later. Choose Role screen (/choose-role): shown after login for a user who holds both roles and has no activeRole; two buttons call POST /api/me/active-role, then go to Home. Users with one role never see it.

RULES:
- Show the NTU-domain requirement before the user types (hint under the email field), and validate it on the client too, while the server stays the authority.
- Never store the password in state longer than needed; use autocomplete attributes.

TESTS TO WRITE:
- Component tests with MSW: wrong domain shows the sentence; third wrong code shows '\''request a new code'\''; a successful verify navigates Home.
- A both-role user with activeRole: null is redirected from Home to Choose Role; choosing Driver lands on the driver Home.

READ FIRST:
- UC-1, UC-2
- FR 1.1, 1.4
- mockups for Login/Register/Verify

DO NOT DO IN THIS TASK:
- Home (A5).

**Branch:** `feat/A4-fe-register-with-code-step`
**PR title:** `[A4] FE: Register (with code step) + Login + Choose Role`
**Depends on:** A2, A6, F15, K8, K9
**Owns:** client/src/pages/auth/Login.tsx, client/src/pages/auth/Register.tsx, client/src/pages/auth/ChooseRole.tsx
**Traces to:** UC-1, UC-2, FR 1.1, FR 1.4

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[A5] FE: Home hub + role switch + logout' --label 'lane:L1,area:FE,wave:W2,size:M,tier:1' --body 'Task **A5** (M, 2 pts)

**Done when:** Home shows entry points for the ACTIVE role (driver: Presets and Go Live; passenger: Request Hop; either: Wallet, My Trips, log out); a user who holds both roles can switch from the header unless a trip is in progress; logging out clears the session.

### Build brief

GOAL: Build the Home hub and logout.

BUILD:
1. Home shows what the user'\''s role allows: driver: '\''Go Live'\'' (disabled with a reason if no preset exists, link to Presets) and '\''My Presets'\''; passenger: '\''Request Hop'\''; both: '\''My Trips'\'' and '\''Wallet'\'' (13 Oct: wallet for everyone). Notification bell and wallet balance chip always visible.
2. If accountStatus = LOCKED show the debt banner with a Top Up button (UC-2 postcondition) and disable Request Hop.
3. Logout button clears the session and returns to Login. A redirect guard sends logged-out users to Login and unverified users to the code step.
4. Role chip and switch control in the page header (a menu with the other role), shown only when the user holds both roles; it calls POST /api/me/active-role and reloads Home for the new role. Disabled with the server'\''s reason while a trip is in progress (ILLEGAL_STATE_TRANSITION). A passenger-only user sees a '\''Become a driver'\'' link to the driver profile (UC-3); a driver-only user sees '\''Use as passenger'\'' (POST /api/me/roles).

RULES:
- A driver with a saved preset reaches Go Live in at most 2 screens from Home (NFR-4.2).
- A first-time rider can reach Request Hop in 1 tap (NFR-4.1 allows 2 minutes overall).

TESTS TO WRITE:
- Tests: driver without preset sees the disabled Go Live reason; LOCKED user sees the banner; logout redirects.

READ FIRST:
- UC-2, UC-20
- NFR-4.1, NFR-4.2
- mockup F12a

**Branch:** `feat/A5-fe-home-hub-role-switch`
**PR title:** `[A5] FE: Home hub + role switch + logout`
**Depends on:** A4, A6, F15, K8, K9, F12a
**Owns:** client/src/pages/home/Home.tsx
**Traces to:** UC-2, NFR-4.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[A6] Active role: choose at login, switch, add a role; server enforces it' --label 'lane:L1,area:BE,wave:W2,size:S,tier:1' --body 'Task **A6** (S, 1 pts)

**Done when:** `POST /api/me/active-role` switches between held roles (refused mid-trip with `ILLEGAL_STATE_TRANSITION`, and for a role not held with `FORBIDDEN`); `POST /api/me/roles` adds the passenger role; the choice is remembered in `User.lastActiveRole`; driver routes refuse a user acting as a passenger and the reverse; tests cover single-role, both-role and mid-trip cases.

### Build brief

GOAL: Let each user state which role they are acting as (driver or passenger), and make the server enforce the permissions of that role.

BUILD:
1. Roles HELD come from registration (User.role: DRIVER, PASSENGER or BOTH, FR 1.5). The role ACTED IN is the session'\''s activeRole (DRIVER or PASSENGER), carried in the JWT next to roles. A user with one role gets it automatically at login. A user with both gets their remembered choice (User.lastActiveRole, F5) or none, in which case me returns activeRole: null and the client shows Choose Role (A4).
2. POST /api/me/active-role { role }: the role must be one the user holds (else FORBIDDEN). Refuse while the user is mid-trip: as driver with a journey LIVE, OPEN, FULL or IN_PROGRESS, or as passenger with a CONFIRMED booking on a journey that is OPEN, FULL or IN_PROGRESS (ILLEGAL_STATE_TRANSITION, message: finish or cancel your trip first). On success store lastActiveRole, reissue the cookie, return the new me.
3. POST /api/me/roles { add: '\''PASSENGER'\'' }: a driver-only user gains the passenger role (creates the Passenger profile; the wallet already exists). Adding DRIVER is NOT done here: a passenger becomes a driver by saving a vehicle and PayNow ID in Manage Driver Profile (UC-3, task B1), which then adds the role.
4. GET /api/auth/me (A2) returns roles, activeRole and the permissions the client needs for navigation.
5. The permission rule itself is in requireRole (F8): it checks activeRole, not just that the profile exists. The matrix of who may do what is in the Plan tab (Roles and permissions).

RULES:
- Role-specific routes (driver: presets, go live, cancel journey, review requests, start, pickup status, complete; passenger: request hop, book, cancel booking) need the matching ACTIVE role. Role-neutral routes (wallet, history, ratings, notifications, quick messages, me) accept any role the user holds.
- Trip participation (tracking rooms, pickup status, messages) is decided by being that journey'\''s driver or that booking'\''s passenger, never by activeRole. Because switching is blocked mid-trip, a role switch can never break a trip in progress.
- Client hiding of buttons is navigation only; the server is the authority (NFR-2.1).

INTERFACE:
- POST /api/me/active-role { role } -> 200 { me }
- POST /api/me/roles { add: '\''PASSENGER'\'' } -> 200 { me }

ERROR CODES TO USE (from server/src/errors/AppError.ts):
FORBIDDEN, ILLEGAL_STATE_TRANSITION, VALIDATION_ERROR, AUTH_REQUIRED

TESTS TO WRITE:
- Single-role user: activeRole set at login, POST active-role for the other role -> FORBIDDEN.
- Both-role user: first login has activeRole null; after choosing, the next login restores it.
- Driver with a LIVE journey cannot switch (ILLEGAL_STATE_TRANSITION); after cancelling it can.
- A driver hitting a passenger-only route with activeRole PASSENGER -> 200, with activeRole DRIVER -> FORBIDDEN (and the reverse).
- Add PASSENGER to a driver-only user: Passenger profile exists, roles updated; adding DRIVER here -> VALIDATION_ERROR.

READ FIRST:
- UC-1, UC-2 (home screen in the user'\''s role context), UC-3 (a passenger who later wants to drive)
- FR 1.5, 1.6, NFR-2.1
- Plan tab: Roles and permissions

DO NOT DO IN THIS TASK:
- The screens (Choose Role in A4, the switch control in A5).
- Adding the driver role (B1).

**Branch:** `feat/A6-active-role-choose-at-login`
**PR title:** `[A6] Active role: choose at login, switch, add a role; server enforces it`
**Depends on:** A2, F8
**Owns:** server/src/services/RoleService.ts, server/src/controllers/RoleController.ts, server/src/routes/roles.routes.ts
**Traces to:** UC-2, UC-1, UC-3, FR 1.5, FR 1.6, NFR-2.1

**Watch out:** Permissions come from the ACTIVE role, not just from holding it. See the Roles and permissions table in the Plan tab.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B1] Presets CRUD service + controller' --label 'lane:L2,area:BE,wave:W2,size:M,tier:1' --body 'Task **B1** (M, 2 pts)

**Done when:** A driver can create, edit, list and delete presets; detour tolerance is capped at 5 minutes; saving requires the existing-journey confirmation and stores it; deleting a preset with a LIVE journey gives `PRESET_IN_USE`.

### Build brief

GOAL: Build the driver profile and journey presets (create, list, edit, delete).

BUILD:
1. DriverProfileService.save({vehiclePlate, vehicleModel, payNowId}): required before going live (FR 1.6).
2. PresetService.create / update / list / delete. A preset has: exit gate (one of the three gate locations, FR 3.1.1), plan SOLO (1 seat) or SHARING (up to 3 seats, FR 3.1.2), at least one allowed pickup type (FR 3.1.3), detour tolerance 0-5 minutes (FR 3.1.4), optional schedule (days + departure time, FR 3.1.5), and exemptionConfirmed (FR 3.1.6).
3. On create, and on edit of exemption-relevant fields, the request must include exemptionConfirmed: true, and the time of confirmation is stored (NFR-6.3).
4. Deleting a preset with a LIVE/OPEN/FULL/IN_PROGRESS journey is refused (UC-3.EX.1).
5. All routes require the driver role and check the preset belongs to the caller (assertOwner).
6. When a PASSENGER-only user saves a complete driver profile (vehicle plate, model, PayNow ID), the service also adds the DRIVER role (User.role becomes BOTH) and creates the Driver record, so a passenger can become a driver without registering again (UC-3, FR 1.6).

RULES:
- A driver who has not confirmed the declaration cannot save the preset.
- Presets are the only place trip details are entered: there is no per-trip Post Journey form any more.

INTERFACE:
- PUT /api/driver/profile
- GET /api/presets
- POST /api/presets
- PUT /api/presets/:id
- DELETE /api/presets/:id

ERROR CODES TO USE (from server/src/errors/AppError.ts):
VALIDATION_ERROR, PRESET_IN_USE, FORBIDDEN, NOT_FOUND

TESTS TO WRITE:
- Tolerance 5 ok, 6 -> VALIDATION_ERROR; plan SOLO with 2 seats rejected; empty pickup types rejected; exit not a gate rejected.
- Delete with a live journey -> PRESET_IN_USE. Editing someone else'\''s preset -> FORBIDDEN. Missing exemption -> VALIDATION_ERROR.
- Passenger-only user saves the profile -> roles includes DRIVER; a driver-only user is unaffected.

READ FIRST:
- UC-3 (flow, AC.1, EX.1)
- FR 1.6, 3.1-3.1.6, NFR-6.3
- entities from F7a

DO NOT DO IN THIS TASK:
- Going live (B3).
- The editor screen (B6).

**Branch:** `feat/B1-presets-crud-service-controller`
**PR title:** `[B1] Presets CRUD service + controller`
**Depends on:** F7a, F8, F15, K3, K4
**Owns:** server/src/services/PresetService.ts, server/src/controllers/PresetController.ts, server/src/routes/presets.routes.ts
**Traces to:** UC-3, UC-3.EX.1, FR 3.1, FR 3.1.1, FR 3.1.2, FR 3.1.3, FR 3.1.4, FR 3.1.6

**Watch out:** Plan risk 15. Split out of JourneyController so B1 and B3 never edit one file.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B2] Google Maps adapter + stored Route' --label 'lane:L2,area:BE,wave:W2,size:M,tier:1' --body 'Task **B2** (M, 2 pts)

**Done when:** Returns a driving route (used only when a driver goes live); the polyline is saved on `Route` so it is not re-requested; an API error or timeout becomes `EXTERNAL_SERVICE_UNAVAILABLE`; the key lives in env only.

### Build brief

GOAL: Get a driving route from Google Maps, store it, and hide the vendor behind the MapsAdapter.

BUILD:
1. GoogleMapsAdapter in server/src/adapters/maps/: route(origin, destination, departAt) returns polyline, duration (seconds) and distance; walkingDistance(a, b) is only used by the seed script (F6); at runtime walking distance is the stored PickupPoint.walkDistanceM.
2. RouteService.calculate(journeyId) (UC-6): call the adapter, store the Route on the journey (polyline + duration), return it. If a route already exists for the same origin/destination, reuse it.
3. Timeouts: 3 s budget so go-live shows the route within 3 s (NFR-1.2).

RULES:
- The API key is read from env only and never sent to the client. The client receives the polyline.
- OneMap is the documented fallback; keep the interface unchanged so it could be swapped in.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
EXTERNAL_SERVICE_UNAVAILABLE

TESTS TO WRITE:
- Adapter test with a recorded response; service test with the fake adapter: failure -> EXTERNAL_SERVICE_UNAVAILABLE and no Route row is written.

READ FIRST:
- UC-6 (flow, EX.1)
- FR 3.3, NFR-1.2
- Plan tab risk 7

DO NOT DO IN THIS TASK:
- Matching (B5b).

**Branch:** `feat/B2-google-maps-adapter-stored-route`
**PR title:** `[B2] Google Maps adapter + stored Route`
**Depends on:** K5, F15, K4
**Owns:** server/src/adapters/maps/**, server/src/services/RouteService.ts
**Traces to:** UC-6, UC-6.EX.1, FR 3.3, NFR-1.2

**Watch out:** Plan risk 7.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B3] Go Live / Cancel Journey with state guards' --label 'lane:L2,area:BE,wave:W2,size:M,tier:1' --body 'Task **B3** (M, 2 pts)

**Done when:** Go Live from a preset sets LIVE and requires location permission (`LOCATION_PERMISSION_REQUIRED`); cancelling a LIVE/OPEN/FULL journey sets all confirmed bookings CANCELLED and records the reason (DRIVER, GEOFENCE, ...).

### Build brief

GOAL: Build Go Live and Cancel Journey, with every state guard.

BUILD:
1. JourneyService.goLive({presetId, position}) (UC-4): require the driver'\''s profile complete (FR 1.6); require location permission flag from the client (LOCATION_PERMISSION_REQUIRED, FR 3.9); refuse if the driver already has a journey IN_PROGRESS or has 2 paid trips today (DAILY_TRIP_LIMIT_REACHED, check Driver.hasReachedDailyLimit); call RouteService (UC-6); create the Journey LIVE linked to the preset with seatsAvailable from the plan (SOLO 1, SHARING 3), departure time now or the preset schedule; return the route. Then trigger matching (B5b) for open hop requests.
2. JourneyService.cancel(journeyId, reason, actor) (UC-5): allowed from LIVE, OPEN, FULL (FR 3.6); sets CANCELLED with cancelReason DRIVER / GEOFENCE / EXPIRED (FR 3.8.2); cancels every CONFIRMED booking, releases held fares through WalletService (UC-21, FR 3.7) in the SAME transaction, and emits JourneyCancelled so passengers are notified (FR 8.3, 8.9).
3. Cancel on IN_PROGRESS is refused (ILLEGAL_STATE_TRANSITION).

RULES:
- The geofence and expiry paths (B4) call the same cancel with no confirmation step; only the driver'\''s own cancel asks for confirmation in the UI.
- Status goes LIVE -> OPEN when the first booking is confirmed and FULL when seats reach 0 (C3 drives this through the entity).

INTERFACE:
- POST /api/journeys { presetId, position, locationPermission } -> 201 { journey, route }
- GET /api/journeys/mine
- POST /api/journeys/:id/cancel -> 200

ERROR CODES TO USE (from server/src/errors/AppError.ts):
LOCATION_PERMISSION_REQUIRED, DAILY_TRIP_LIMIT_REACHED, ILLEGAL_STATE_TRANSITION, EXTERNAL_SERVICE_UNAVAILABLE, NOT_FOUND, FORBIDDEN

TESTS TO WRITE:
- Go live with no preset -> NOT_FOUND; location permission false -> LOCATION_PERMISSION_REQUIRED; 2 trips done -> DAILY_TRIP_LIMIT_REACHED; Maps down -> EXTERNAL_SERVICE_UNAVAILABLE and no journey row.
- Cancel with 2 confirmed bookings: both CANCELLED, both holds released, event emitted once. Cancel while IN_PROGRESS -> ILLEGAL_STATE_TRANSITION.

READ FIRST:
- UC-4 and UC-5 (flows, EX.1-EX.4)
- FR 3.2-3.9, 6.4
- state machine A (dialog maps)

DO NOT DO IN THIS TASK:
- Geofence monitoring and expiry timers (B4).
- Start Trip (D1).

**Branch:** `feat/B3-go-live-cancel-journey-with`
**PR title:** `[B3] Go Live / Cancel Journey with state guards`
**Depends on:** B1, B2, F7b, F15, K3, K4
**Owns:** server/src/services/JourneyService.ts, server/src/controllers/JourneyController.ts, server/src/routes/journeys.routes.ts
**Traces to:** UC-4, UC-5, UC-4.EX.1, FR 3.2, FR 3.4, FR 3.6, FR 3.7, FR 3.9

**Watch out:** Plan risk 3.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B4] Geofence controller + expiry hook' --label 'lane:L2,area:BE,wave:W2,size:M,tier:2' --body 'Task **B4** (M, 2 pts)

**Done when:** A driver location outside the (configurable) campus boundary plus grace margin cancels the journey with reason GEOFENCE and notifies everyone; a LIVE journey with no booking in its window becomes EXPIRED.

### Build brief

GOAL: Cancel a journey automatically if the driver leaves campus before starting, or if nobody books in time.

BUILD:
1. GeofenceService.checkPosition(journeyId, position): if the journey is LIVE, OPEN or FULL and the position is outside the campus boundary polygon plus the grace margin (config, FR 3.8.1), call JourneyService.cancel(..., '\''GEOFENCE'\'') (UC-5.EX.1). Never fires once the journey is IN_PROGRESS.
2. Position input arrives from POST /api/journeys/:id/position (pre-start, about every 5 s from the driver'\''s phone). After start the realtime stream (D2) is used.
3. Use a dwell rule so one bad GPS fix does not cancel: require 2 consecutive outside readings (value in config). Boundary polygon lives in server/src/config/campusBoundary.ts (placeholder until Appendix C Q12 is settled).
4. ExpiryHook.run(): set LIVE journeys with no CONFIRMED booking after LIVE_WINDOW_MIN to EXPIRED (FR 3.5, UC-5.EX.2) and emit JourneyExpired. D4 schedules it.

RULES:
- Both paths notify the driver as well as passengers (FR 8.9) and record the reason (FR 3.8.2).

INTERFACE:
- POST /api/journeys/:id/position { lat, lng, accuracyM, ts } -> 204

ERROR CODES TO USE (from server/src/errors/AppError.ts):
ILLEGAL_STATE_TRANSITION, FORBIDDEN

TESTS TO WRITE:
- Inside, just outside the margin, outside once, outside twice -> only the last cancels. A journey already IN_PROGRESS is never cancelled by position.
- Expiry with FakeClock: just before and just after the window.

READ FIRST:
- UC-5.EX.1, UC-5.EX.2, UC-4.EX.3, UC-4.EX.4
- FR 3.5, 3.8, 3.8.1, 3.8.2, 8.9
- Appendix C Q7 and Q12 (open values)

DO NOT DO IN THIS TASK:
- The scheduler loop (D4).

**Branch:** `feat/B4-geofence-controller-expiry-hook`
**PR title:** `[B4] Geofence controller + expiry hook`
**Depends on:** B3, F15, K3, K4
**Owns:** server/src/services/GeofenceService.ts, server/src/controllers/GeofenceController.ts, server/src/routes/geofence.routes.ts
**Traces to:** UC-5.EX.1, UC-5.EX.2, FR 3.8, FR 3.8.1, FR 3.8.2

**Watch out:** System-triggered, so this raises events (K6), not request errors.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B5a] Request Hop lifecycle (post, stay open, expire)' --label 'lane:L2,area:BE,wave:W2,size:M,tier:1' --body 'Task **B5a** (M, 2 pts)

**Done when:** A passenger posts a request for now or later; times in the past are rejected; with no driver yet it stays open within its window and expires after; a LOCKED passenger is refused with `ACCOUNT_LOCKED`.

### Build brief

GOAL: Build posting a hop request and its life cycle: open, stay open, expire.

BUILD:
1. HopRequestService.create({fromLocationId, toLocationId, requestedTime|now}) (UC-7): both locations must exist in the catalog (FR 4.1.1, 4.1.2); requested time not earlier than now (FR 4.1.3); caller must be an ACTIVE passenger (a LOCKED passenger gets ACCOUNT_LOCKED, UC-7.EX.1); create HopRequest OPEN and call the matching service (B5b).
2. If no journey matches, the request stays OPEN and is offered to drivers who go live within its window (UC-7.AC.1, FR 4.10). When a matching driver later goes live the passenger is notified (FR 8.11).
3. expire() sweep: OPEN requests past their time window become EXPIRED. A request is MATCHED once a booking is made from it (HopRequest.resolve).

RULES:
- Time '\''now'\'' means now by Clock. Scheduled/future requests are the part that can be cut (Tier 3 flag scheduledRequests).
- One passenger may have only one OPEN request at a time (prevents spam).

INTERFACE:
- POST /api/hop-requests { fromLocationId, toLocationId, requestedTime? } -> 201 { hopRequest, matches? }
- GET /api/hop-requests/mine

ERROR CODES TO USE (from server/src/errors/AppError.ts):
VALIDATION_ERROR, NOT_FOUND, ACCOUNT_LOCKED, CONFLICT

TESTS TO WRITE:
- Past time -> VALIDATION_ERROR; unknown location -> NOT_FOUND; LOCKED passenger -> ACCOUNT_LOCKED; second open request -> CONFLICT.
- Request with no match stays OPEN; after the window it is EXPIRED (FakeClock).

READ FIRST:
- UC-7 (flow, AC.1, EX.1)
- FR 4.1-4.1.3, 4.10
- state machine for HopRequest

DO NOT DO IN THIS TASK:
- Ranking (B5b).

**Branch:** `feat/B5a-request-hop-lifecycle-post-stay`
**PR title:** `[B5a] Request Hop lifecycle (post, stay open, expire)`
**Depends on:** F7b, F15, K3, K4
**Owns:** server/src/services/HopRequestService.ts, server/src/controllers/HopRequestController.ts, server/src/routes/hops.routes.ts
**Traces to:** UC-7, FR 4.1, FR 4.1.1, FR 4.1.2, FR 4.1.3, FR 4.10

**Watch out:** Split out of MatchingController so B5a and B5b never edit one file; merge later if you prefer. Requests for "now" are core; only scheduled-for-later requests are cuttable (flag K15).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B5b] Find Matches: filters, Strategy ranking, MatchResultSet' --label 'lane:L2,area:BE,wave:W2,size:L,tier:1' --body 'Task **B5b** (L, 4 pts)

**Done when:** Both directions work (driver-first and passenger-first); only matches within the driver'\''s detour tolerance, an allowed pickup type, free seats and an unlocked passenger are returned; ranking is a swappable strategy; results arrive within 3 seconds (NFR-1.1); matching uses only stored data and distance maths, never Maps.

### Build brief

GOAL: Build the matching engine used in both directions: passenger requests find journeys, and a driver going live finds requests.

BUILD:
1. MatchingService.findJourneysFor(hopRequest) and MatchingService.findRequestsFor(journey) (UC-8) share one filter chain: same time window -> pickup point of a type the driver'\''s preset allows (FR 4.7) -> added detour within the preset tolerance and never over 5 min (FR 4.2; computed locally by detourMinutes, see rules, with NO Maps call) -> free seats for the plan -> passenger not LOCKED (FR 4.9).
2. Rank with a Strategy: RankingStrategy.score(candidate) default = weighted driver detour + passenger walking distance, with driver rating and payment history as trust signals (FR 4.5). Keep weights in config. MatchResultSet.rank(strategy) applies it.
3. Each result carries: walking distance in metres (FR 4.3), estimated pickup time (4.4.1), driver average rating (4.4.2), rider'\''s current fare from FareService (4.4.3) and the payment-history indicator (4.4.4, derived from UNPAID count, FR 9.6).
4. Driver side: GET /api/journeys/:id/requests returns matching OPEN requests as cards (FR 4.8) and is called again when new requests arrive (pushed via D3/K7 events).

RULES:
- Matching is our own code and never calls Maps (13 Oct decision; UC-8 no longer includes UC-6). detourMinutes(routePolyline, pickupPoint) = 2 x the shortest distance from the pickup point to the driver'\''s STORED route (saved by UC-6 at go-live) divided by an average speed (config, default 20 km/h). It is an estimate, which is enough on a campus.
- Return within 3 seconds (NFR-1.1): pure distance maths on stored data, so cap candidates and index by time window.
- A journey with no stored route is not matchable. Walking distance comes from the stored PickupPoint.walkDistanceM (FR 2.5), never from Maps.

INTERFACE:
- GET /api/hop-requests/:id/matches -> 200 [{ journeyId, driver, pickupPoint, walkM, pickupTime, rating, paymentHistory, fareCents }]
- GET /api/journeys/:id/requests -> request cards

ERROR CODES TO USE (from server/src/errors/AppError.ts):
NOT_FOUND, FORBIDDEN

TESTS TO WRITE:
- Basis-path test (Lab 4, Q2): each filter rejects independently; detour exactly 5 passes, 5.1 fails; LOCKED excluded; wrong pickup type excluded.
- Ranking test: with fixed inputs the order is deterministic; swapping the strategy changes the order.
- Detour: a pickup point on the route gives 0 minutes; one 1.0 km off the route at 20 km/h gives 6 minutes and is rejected (over 5).

READ FIRST:
- UC-8 (flow)
- FR 4.2-4.9, 9.6, NFR-1.1
- MatchResultSet in the design model

DO NOT DO IN THIS TASK:
- Creating a booking (C3).

**Branch:** `feat/B5b-find-matches-filters-strategy-ranking`
**PR title:** `[B5b] Find Matches: filters, Strategy ranking, MatchResultSet`
**Depends on:** B3, B5a, F15, K3, K4, B2
**Owns:** server/src/services/MatchingService.ts, server/src/controllers/MatchingController.ts, server/src/routes/matching.routes.ts
**Traces to:** UC-8, FR 4.2, FR 4.5, FR 4.7, FR 4.8, FR 4.9, NFR-1.1

**Watch out:** This is one of the two Lab 4 basis-path candidates (Q2): keep the filter chain a pure function.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B6] FE: Presets list + Preset Editor' --label 'lane:L2,area:FE,wave:W2,size:M,tier:1' --body 'Task **B6** (M, 2 pts)

**Done when:** List, create, edit, delete; gate picker shows only catalog gates; plan SOLO/SHARING; the existing-journey confirmation is required; a driver reaches Go Live in 4 screens or fewer.

### Build brief

GOAL: Build the Presets list and the Preset Editor.

BUILD:
1. Presets list: each preset with exit gate, plan, tolerance; New, Edit, Delete (confirm dialog); a clear message when delete is blocked by a live journey (PRESET_IN_USE).
2. Editor: exit-gate picker (three gates only), plan SOLO/SHARING, allowed pickup-type checkboxes, detour tolerance (0-5), optional schedule, vehicle plate/model and PayNow ID (first time only), and the exemption declaration checkbox with its full wording; Save disabled until ticked.
3. Editing an exemption-relevant field re-asks for the declaration (UC-3.AC.1).

RULES:
- Catalog pickers, not free text (SRS UI constraints).
- Tolerance control cannot go above 5.

TESTS TO WRITE:
- Tests: Save disabled without declaration; delete of an in-use preset shows the '\''cancel the journey first'\'' sentence.

READ FIRST:
- UC-3
- FR 3.1.1-3.1.6
- mockup F12b

**Branch:** `feat/B6-fe-presets-list-preset-editor`
**PR title:** `[B6] FE: Presets list + Preset Editor`
**Depends on:** B1, F15, K8, K9, F12b
**Owns:** client/src/pages/driver/Presets.tsx, client/src/pages/driver/PresetEditor.tsx
**Traces to:** UC-3, FR 3.1.1, FR 3.1.2, FR 3.1.3, FR 3.1.4, NFR-4.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B7] FE: Location Permission + Live/Waiting' --label 'lane:L2,area:FE,wave:W2,size:M,tier:1' --body 'Task **B7** (M, 2 pts)

**Done when:** Explains why location is needed and asks the browser; denial returns to Home with a message; Live shows status, route summary, seats left and Cancel.

### Build brief

GOAL: Build the Location Permission screen and the Live/Waiting screen.

BUILD:
1. Location Permission: explain why (geofence and trip tracking), request the browser permission, and if denied show the UC-4.EX.1 explanation without going live.
2. Go Live action (from Home or a preset): calls POST /api/journeys; shows the route on the map within 3 s (NFR-1.2); on error show the retry message (UC-4.EX.2).
3. Live/Waiting: journey status chip (LIVE/OPEN/FULL), countdown to expiry, pushes the driver'\''s position to /position every 5 s while the screen is open, request cards appear when matches arrive (links to C5), Cancel Journey with a confirmation dialog, Start Trip button enabled once a booking is confirmed (links to D5).
4. If the server cancels the journey (geofence/expired) navigate to the Cancelled Notice.

RULES:
- Position updates run only while a journey is LIVE/OPEN/FULL/IN_PROGRESS (NFR-5.3).

TESTS TO WRITE:
- Tests with MSW: permission denied path; go-live error path; cancel confirm flow; server-side cancel redirects to the notice.

READ FIRST:
- UC-4, UC-5
- FR 3.6, 3.9, 7.11, NFR-1.2
- mockup F12b

**Branch:** `feat/B7-fe-location-permission-live-waiting`
**PR title:** `[B7] FE: Location Permission + Live/Waiting`
**Depends on:** B3, F15, K8, K9, F12b
**Owns:** client/src/pages/driver/LocationPermission.tsx, client/src/pages/driver/LiveWaiting.tsx
**Traces to:** UC-4, UC-5, UC-4.EX.1, FR 3.6, FR 3.9, FR 7.11

**Watch out:** Plan risk 10: location only works while the page is open.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B8] FE: Request Hop + Match Results' --label 'lane:L2,area:FE,wave:W2,size:M,tier:1' --body 'Task **B8** (M, 2 pts)

**Done when:** Catalog pickers instead of free text; ranked cards show walking distance, pickup time, driver rating and current fare; empty state says the request stays open; a first-time rider submits in under 2 minutes.

### Build brief

GOAL: Build Request Hop and Match Results.

BUILD:
1. Request Hop: origin and destination pickers from GET /api/locations (catalog), a time control with '\''Now'\'' as the default, Submit. A first-time rider should finish in under 2 minutes (NFR-4.1).
2. Match Results: ranked cards showing walking distance in metres, estimated pickup time, driver average rating, current fare and payment-history indicator (FR 4.3-4.4.4). Tapping a card opens Booking Detail (C6).
3. Empty state: '\''No match yet - we will tell you when a driver goes live'\'' (UC-7.AC.1). A LOCKED user sees the locked notice instead of the form (UC-7.EX.1).

RULES:
- Results appear within 3 s of submit (show a skeleton, not a spinner-only screen).

TESTS TO WRITE:
- Tests: same origin/destination blocked client-side; empty results show the waiting state; LOCKED shows the notice.

READ FIRST:
- UC-7, UC-8
- FR 4.1, 4.3, 4.4, 4.6, NFR-4.1
- mockup (Plan tab screen table)

**Branch:** `feat/B8-fe-request-hop-match-results`
**PR title:** `[B8] FE: Request Hop + Match Results`
**Depends on:** B5a, B5b, F15, K8, K9
**Owns:** client/src/pages/hop/RequestHop.tsx, client/src/pages/hop/MatchResults.tsx
**Traces to:** UC-7, UC-8, FR 4.1, FR 4.3, FR 4.4, FR 4.6, NFR-4.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[B9] FE: Cancelled Notice' --label 'lane:L2,area:FE,wave:W2,size:S,tier:3' --body 'Task **B9** (S, 1 pts)

**Done when:** Shows who cancelled and why (left NTU, window expired, manual) and what happens to the fare or hold, with a button back to Home.

### Build brief

GOAL: Build the Cancelled Notice screen (cuttable).

BUILD:
1. Shows why the journey ended: DRIVER, GEOFENCE ('\''you left campus before starting'\'') or EXPIRED ('\''no booking within the window'\''), and what happens next (held fares released).
2. For passengers: '\''Your driver cancelled'\'' with a button to Request Hop again.

RULES:
- Wording differs by cancelReason and by role.

TESTS TO WRITE:
- Test: each reason renders its own sentence.

READ FIRST:
- UC-5
- FR 8.3, 8.9, 3.8.2

**Branch:** `feat/B9-fe-cancelled-notice`
**PR title:** `[B9] FE: Cancelled Notice`
**Depends on:** B3, F15, K8
**Owns:** client/src/pages/notice/CancelledNotice.tsx
**Traces to:** UC-5, FR 8.3, FR 8.9

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C1] Fare service + controller (tiers, re-tier)' --label 'lane:L3,area:BE,wave:W2,size:M,tier:1' --body 'Task **C1** (M, 2 pts)

**Done when:** Current and final fare follow the tier table ($3.00 for 1 rider, $2.00 each for 2-3); a NO_SHOW or UNPAID recomputes the remaining riders; no endpoint edits the tiers.

### Build brief

GOAL: Compute fares from the fare table, and re-compute every rider'\''s fare when the headcount changes.

BUILD:
1. FareService.currentFare(journeyId): fare per rider from the number of currently CONFIRMED riders (FR 5.2). FareService.finalFare(journeyId): from the number of riders actually picked up (FR 5.1). Both read FareTier through FareTier.calculateFare (1 rider 300 cents; 2-3 riders 200 cents each).
2. FareService.retier(journeyId): called by BookingService after any confirm, cancel or no-show. Recomputes each confirmed rider'\''s current fare, asks WalletService to adjust each hold by the difference (FR 5.11, UC-21.AC.1), and emits FareChanged per rider whose fare moved (FR 8.4).
3. After a NO_SHOW or UNPAID the remaining riders'\'' FINAL fare is recomputed from riders picked up (FR 5.1.3).

RULES:
- Only read the table: no surge or demand pricing, no endpoint edits it (NFR-6.1).
- All arithmetic in cents via Money.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
VALIDATION_ERROR

TESTS TO WRITE:
- Table-driven test: riders 1, 2, 3 -> 300, 200, 200 cents; 0 and 4 riders throw.
- Retier: 1 rider confirmed (300) then a second confirms: both now 200, two FareChanged events, holds adjusted by -100 each.
- Lab 4 Q1 equivalence classes and boundaries live in task Q1.

READ FIRST:
- FR 5.1-5.2, 5.11, 8.4, NFR-6.1
- UC-21.AC.1
- FareTier in the design model

DO NOT DO IN THIS TASK:
- Wallet movement itself (C2).

**Branch:** `feat/C1-fare-service-controller-tiers-re`
**PR title:** `[C1] Fare service + controller (tiers, re-tier)`
**Depends on:** F7b, F15, K3, K4
**Owns:** server/src/services/FareService.ts, server/src/controllers/FareController.ts, server/src/routes/fares.routes.ts
**Traces to:** UC-21, FR 5.1, FR 5.1.1, FR 5.1.2, FR 5.1.3, FR 5.2, NFR-6.1

**Watch out:** Plan risk 14. This is the Lab 4 black-box candidate (Q1): treat FareController + FareService as one unit.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C2] Wallet service: hold, release, deduct, credit, simulated PayNow' --label 'lane:L3,area:BE,wave:W2,size:L,tier:1' --body 'Task **C2** (L, 4 pts)

**Done when:** Each money movement is one database transaction with its ledger row; the balance never goes negative (`INSUFFICIENT_BALANCE`); every movement is recorded as a transaction; top-up and payout are simulated and say so.

### Build brief

GOAL: Build the wallet: top up, hold, release, deduct, credit. Every movement is one database transaction with its ledger row.

BUILD:
1. WalletService.getWallet(userId): balance, held, available (= balance - held), and any outstanding Debt (UC-20 step 1). Wallets belong to every User (13 Oct decision) and are created at registration (A2).
2. topUp(userId, cents) (UC-20): positive integer cents, wallet cannot exceed 100000 cents / $1,000 (NFR-6.5); goes through PayNowAdapter.simulateTopUp; credits the wallet and writes a TOP_UP transaction. After crediting, call AccountLockService.tryUnlock (C4).
3. hold(bookingId, cents), release(bookingId), adjustHold(bookingId, newCents) (UC-21 HOLD / RELEASE, FR 5.11); deduct(bookingId, finalCents) takes the passenger'\''s final fare from the wallet (FR 10.5); credit(driverUserId, cents) adds the driver'\''s earnings to the DRIVER'\''s wallet. Each writes a WalletTransaction (HOLD / RELEASE / DEDUCT / CREDIT) with the bookingId (FR 10.10).
4. Withdrawal to PayNow (FR 10.12, simulated) is a separate action recorded as PAYOUT; its cadence and fees are still open (Appendix C Q5), so keep it behind a flag. FR 10.6, updated on 13 Oct, credits each deducted fare to the driver'\''s wallet.
5. Every method takes the transaction from withTransaction (K3) and locks the wallet row first (SELECT ... FOR UPDATE), so concurrent holds cannot overspend (NFR-3.3, NFR-3.4).

RULES:
- Hold is applied atomically with the booking state change that causes it (NFR-3.4): C3 calls hold inside the same transaction that confirms the booking.
- All screens and API responses must label money as SIMULATED (FR 10.11); the adapter never contacts a real payment service (NFR-6.4).

INTERFACE:
- GET /api/wallet -> { balanceCents, heldCents, availableCents, debt? }
- POST /api/wallet/top-up { amountCents } -> 200 (simulated)
- GET /api/wallet/transactions

ERROR CODES TO USE (from server/src/errors/AppError.ts):
INSUFFICIENT_BALANCE, VALIDATION_ERROR, NOT_FOUND

TESTS TO WRITE:
- Hold more than available -> INSUFFICIENT_BALANCE and nothing written (UC-21.EX.1).
- Concurrency: two parallel holds that together exceed the balance -> exactly one succeeds.
- Ledger: the sum of transactions equals the balance after any sequence; release restores exactly what hold took.
- Top-up above the $1,000 cap -> VALIDATION_ERROR.

READ FIRST:
- UC-20 and UC-21 (flows, AC.1, EX.1)
- FR 5.11, 10.1, 10.5, 10.6, 10.10, 10.11, NFR-3.3, NFR-3.4, NFR-6.4, NFR-6.5
- Plan tab risks 2 and 16

DO NOT DO IN THIS TASK:
- Deciding WHEN to lock (C4).
- Booking rules (C3).

**Branch:** `feat/C2-wallet-service-hold-release-deduct`
**PR title:** `[C2] Wallet service: hold, release, deduct, credit, simulated PayNow`
**Depends on:** F7c, F5, F15, K3, K4, K5
**Owns:** server/src/services/WalletService.ts, server/src/controllers/WalletController.ts, server/src/routes/wallet.routes.ts, server/src/adapters/paynow/**
**Traces to:** UC-20, UC-21, UC-21.EX.1, FR 10.1, FR 10.5, FR 10.6, FR 10.10, FR 10.11, FR 5.11

**Watch out:** Plan risks 2 and 16.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C3] Booking service + controller (book, accept/decline, cancel, reorder)' --label 'lane:L3,area:BE,wave:W2,size:L,tier:1' --body 'Task **C3** (L, 4 pts)

**Done when:** A new booking is PENDING; accept sets CONFIRMED and takes the seat with one atomic statement (the last seat can be won only once: `SEAT_UNAVAILABLE`); decline or no response cancels; passenger cancel is refused once IN_PROGRESS; the wallet check and hold run in the same transaction; SHARING re-orders pickups.

### Build brief

GOAL: Build booking: preview the balance check, book, accept or decline, and cancel. This is the busiest service in the system.

BUILD:
1. preview(passengerId, journeyId) (UC-7, wallet-check step): returns the current fare and one of ENOUGH (available >= fare, FR 10.2), ON_TRUST (available >= 75% of fare and completedRides >= 3, FR 10.3, shared helper from C4) or NOT_ENOUGH (FR 10.4). The result is also notified (FR 8.8).
2. book({journeyId, hopRequestId?, pickupPointId, dropoffPointId}) (UC-7, booking steps): passenger ACTIVE (requireUnlocked, FR 10.8); journey has seats left (SEAT_UNAVAILABLE, FR 5.7); not NOT_ENOUGH (INSUFFICIENT_BALANCE); create Booking PENDING (FR 5.3); emit BookingRequested (driver notified, FR 8.1). No hold yet: it happens on accept (UC-10, Confirm Match).
3. accept(bookingId) (UC-10), ONE transaction: lock the journey row; if no seat left -> decline automatically and emit events (UC-10.EX.2, SEAT_UNAVAILABLE); Booking.confirm(); Journey.decrementSeats() and LIVE -> OPEN / FULL (FR 5.6, 3.4); WalletService.hold the current fare (if the balance dropped meanwhile -> decline with INSUFFICIENT_BALANCE); FareService.retier; for SHARING re-order pickups to minimise total detour (FR 4.11; flag reorderPickups); resolve the HopRequest if any; emit BookingConfirmed.
4. decline(bookingId) -> CANCELLED, emit BookingDeclined (FR 5.5, 8.2). cancel(bookingId) (UC-11): PENDING or CONFIRMED and journey not started; seats +1, release hold, retier, notify driver and fare-affected riders; if IN_PROGRESS -> ILLEGAL_STATE_TRANSITION (UC-11.EX.1).
5. A LOCKED passenger may still cancel (UC-11 assumption).

RULES:
- Only the journey'\''s own driver may accept or decline; only the booking'\''s passenger may cancel (assertOwner).
- Seat decrement must survive concurrency (NFR-3.1): lock the journey row or use a conditional update, never read-then-write.
- Unanswered PENDING bookings are auto-declined at departure by the job in D4 (FR 5.5).

INTERFACE:
- GET /api/bookings/preview?journeyId= -> { fareCents, check: '\''ENOUGH'\''|'\''ON_TRUST'\''|'\''NOT_ENOUGH'\'' }
- POST /api/bookings -> 201
- POST /api/bookings/:id/accept | decline | cancel
- GET /api/journeys/:id/bookings (driver inbox)

ERROR CODES TO USE (from server/src/errors/AppError.ts):
SEAT_UNAVAILABLE, INSUFFICIENT_BALANCE, ACCOUNT_LOCKED, ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND

TESTS TO WRITE:
- Two passengers accept for the last seat at the same moment -> exactly one CONFIRMED, one auto-declined with SEAT_UNAVAILABLE.
- Book on a full journey -> SEAT_UNAVAILABLE; LOCKED passenger -> ACCOUNT_LOCKED; NOT_ENOUGH -> INSUFFICIENT_BALANCE; ON_TRUST requires 3 completed rides (2 fails, 3 passes) and balance exactly 75% passes, 74% fails.
- Accept third rider: fares go 300 -> 200 for all and holds adjust; cancel one: fares go back and FareChanged is emitted.
- Cancel while IN_PROGRESS -> ILLEGAL_STATE_TRANSITION; failed hold rolls the whole accept back.

READ FIRST:
- UC-7 (booking steps), UC-10 Confirm Match, UC-11 (flows, AC, EX)
- FR 4.11, 5.2-5.8, 5.10, 5.11, 8.1, 8.2, 8.4, 8.8, 10.2-10.4, 10.8, NFR-3.1, NFR-3.4
- state machine B (Booking)

DO NOT DO IN THIS TASK:
- Start Trip and anything after it (D1).
- The cards and detail screens (C5, C6).

**Branch:** `feat/C3-booking-service-controller-book-accept`
**PR title:** `[C3] Booking service + controller (book, accept/decline, cancel, reorder)`
**Depends on:** C1, C2, B5b, F15, K3, K4
**Owns:** server/src/services/BookingService.ts, server/src/controllers/BookingController.ts, server/src/routes/bookings.routes.ts
**Traces to:** UC-7, UC-10, UC-11, UC-7.EX.2, UC-7.EX.3, UC-10.EX.2, UC-11.EX.1, FR 5.3, FR 5.4, FR 5.5, FR 5.6, FR 5.7, FR 5.8, FR 5.10, FR 4.11, NFR-3.1

**Watch out:** Plan risks 1 and 2.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C4] Account lock/unlock + Debt + trust-booking rule' --label 'lane:L3,area:BE,wave:W2,size:M,tier:2' --body 'Task **C4** (M, 2 pts)

**Done when:** A booking on trust that is not topped up by completion becomes UNPAID, records the shortfall as Debt and locks the passenger; topping up at least the shortfall unlocks.

### Build brief

GOAL: Lock an account when a booked-on-trust fare is not paid, and unlock it when the passenger tops up.

BUILD:
1. AccountLockService.recordShortfall(booking, shortfallCents) (UC-13.EX.1, FR 10.7): create a Debt, User.lock('\''DEBT'\''), mark the booking'\''s payment UNPAID, emit DebtRecorded and AccountLocked (FR 8.10).
2. tryUnlock(userId): called after every top-up (C2). If available balance >= outstanding debt: deduct it, Debt.clear(), User.unlock(), emit AccountUnlocked (FR 10.9, UC-20 step 5).
3. trustDecision(wallet, passenger, fareCents): the single shared function for the ENOUGH / ON_TRUST / NOT_ENOUGH rule used by C3'\''s preview and book (FR 10.2-10.4). Thresholds (75%, 3 rides) in config because Appendix C Q5 may change them.
4. Expose the outstanding debt in GET /api/wallet so the Locked Account screen can show it.

RULES:
- A LOCKED passenger can log in, see the wallet, top up and cancel; they cannot book (FR 10.8). Whether they may also REQUEST a hop is Appendix C Q6; the current UC-7 text blocks it.
- Debt amount is never negative and is never partially hidden: show the exact shortfall.

ERROR CODES TO USE (from server/src/errors/AppError.ts):
ACCOUNT_LOCKED, INSUFFICIENT_BALANCE

TESTS TO WRITE:
- Shortfall -> Debt exists, user LOCKED, two events. Top-up smaller than debt -> still LOCKED; equal to debt -> ACTIVE, Debt cleared (boundary).
- Trust boundary: 75% exactly, 74.99%; rides 2 vs 3.

READ FIRST:
- UC-13.EX.1, UC-20
- FR 6.9, 10.3, 10.7-10.9

DO NOT DO IN THIS TASK:
- The daily two-trip limit lives in D1 (start trip).

**Branch:** `feat/C4-account-lock-unlock-debt-trust`
**PR title:** `[C4] Account lock/unlock + Debt + trust-booking rule`
**Depends on:** C2, F15, K3, K4
**Owns:** server/src/services/AccountService.ts, server/src/controllers/AccountController.ts, server/src/routes/account.routes.ts
**Traces to:** UC-13.EX.1, UC-20, FR 6.9, FR 10.3, FR 10.7, FR 10.8, FR 10.9

**Watch out:** The two-trip daily limit is D1'\''s job, using `Driver.hasReachedDailyLimit` (Plan risk 13).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C5] FE: Request Cards (driver)' --label 'lane:L3,area:FE,wave:W2,size:M,tier:1' --body 'Task **C5** (M, 2 pts)

**Done when:** One card per request: rating, pickup point, added detour, fare with the fare-drop note, payment-history indicator, Accept and Decline; seat usage visible.

### Build brief

GOAL: Build the driver'\''s Request Cards screen.

BUILD:
1. List the driver'\''s pending requests for the live journey: passenger first name, rating, payment-history indicator, pickup point, added detour in minutes, current fare after acceptance (FR 4.4.4, 8.1). The same component is used for cards that arrive during Go Live (matching hop requests, FR 4.8) and bookings in the inbox.
2. Accept and Decline buttons call accept / decline; show the result ('\''seat taken - declined automatically'\'' for SEAT_UNAVAILABLE, UC-10.EX.2). New cards arrive live from notification:new / events.
3. Do not show the passenger'\''s NTU email or phone (NFR-5.2).

RULES:
- One tap per decision; accepted cards move to a confirmed list with the final pickup order.

TESTS TO WRITE:
- Tests: accept shows confirmed; concurrent-accept error shows the sentence; no PII in the DOM.

READ FIRST:
- UC-10
- FR 4.4.4, 4.8, 8.1, NFR-5.2
- mockup F12b

**Branch:** `feat/C5-fe-request-cards-driver`
**PR title:** `[C5] FE: Request Cards (driver)`
**Depends on:** C3, F15, K8, K9, F12b
**Owns:** client/src/pages/booking/RequestCards.tsx
**Traces to:** UC-10, FR 8.1, FR 4.4.4

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C6] FE: Booking Detail (balance banner, confirm, pending)' --label 'lane:L3,area:FE,wave:W2,size:M,tier:1' --body 'Task **C6** (M, 2 pts)

**Done when:** Shows journey summary, pickup point, fare panel and the wallet-check result; Confirm is disabled with a Top Up offer when the balance is below the rule; then a '\''waiting for driver'\'' state and Cancel.

### Build brief

GOAL: Build Booking Detail with the balance banner and the confirm flow.

BUILD:
1. Show the match: driver name, rating, payment-history indicator, vehicle plate and model (safety, section 5.2), pickup point, walking distance, pickup time and current fare.
2. Balance banner from GET /api/bookings/preview: Enough (green), Booked on trust (amber, '\''top up before the trip ends'\''), Not enough (red; Confirm disabled; button to the Wallet) (FR 5.10, 10.2-10.4, UC-7.EX.2). Re-run the preview when the balance changes.
3. Confirm calls POST /api/bookings; then show PENDING ('\''waiting for the driver'\'') and update live to CONFIRMED / CANCELLED. Cancel booking button with a confirmation (UC-11), hidden once the journey is IN_PROGRESS.

RULES:
- All money labelled SIMULATED where it appears (FR 10.11).
- Show the fare change message if the tier changes while PENDING/CONFIRMED.

TESTS TO WRITE:
- Tests: Not enough disables Confirm; trust banner text; PENDING -> CONFIRMED update; cancel hidden when in progress.

READ FIRST:
- UC-7, UC-11
- FR 5.2, 5.10, 8.8, 10.2-10.4
- mockup F12c

**Branch:** `feat/C6-fe-booking-detail-balance-banner`
**PR title:** `[C6] FE: Booking Detail (balance banner, confirm, pending)`
**Depends on:** C3, F15, K8, K9, F12c
**Owns:** client/src/pages/booking/BookingDetail.tsx
**Traces to:** UC-7, UC-7.EX.2, FR 10.2, FR 10.3, FR 10.4, FR 8.8

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[C7] FE: Wallet, Top-Up, Locked Account' --label 'lane:L3,area:FE,wave:W2,size:M,tier:1' --body 'Task **C7** (M, 2 pts)

**Done when:** Balance, held amount and a transaction ledger; Top-Up carries an unmissable '\''simulated, no real money'\'' banner and returns to where the user came from; a LOCKED account sees the outstanding amount and a Top Up button on this screen (the redirect itself is the RequireUnlocked guard from F9).

### Build brief

GOAL: Build the Wallet, Top-Up and Locked Account screens.

BUILD:
1. Wallet (for every user): balance, held amount, available, outstanding shortfall if any, recent transactions; drivers also see earnings credited. Top Up button.
2. Top-Up: amount entry (shortfall pre-filled when LOCKED), a clearly labelled '\''Simulate payment'\'' control standing in for the PayNow QR (UC-20 step 3), and an unmissable SIMULATED banner (FR 10.11). On success, show the new balance; if the account unlocked, say so.
3. Locked Account: the page a LOCKED user lands on with the reason, the amount owed and the way out (UC-7.EX.1, FR 10.8, 10.9). It replaces the booking screens until unlocked.

RULES:
- Disable the pay button while the request is in flight (no double top-up).
- Round-trip: after top-up refresh wallet and auth me (account status).

TESTS TO WRITE:
- Tests: shortfall pre-fill; unlock message; double-click sends one request.

READ FIRST:
- UC-20, UC-7.EX.1
- FR 10.1, 10.8-10.11
- mockups F12a, F12c

**Branch:** `feat/C7-fe-wallet-top-up-locked`
**PR title:** `[C7] FE: Wallet, Top-Up, Locked Account`
**Depends on:** C2, F15, K8, K9, F12a, F12c
**Owns:** client/src/pages/wallet/Wallet.tsx, client/src/pages/wallet/TopUp.tsx, client/src/pages/locked/LockedAccount.tsx
**Traces to:** UC-20, UC-7.EX.1, FR 10.1, FR 10.8, FR 10.9, FR 10.10, FR 10.11

**Watch out:** Plan risk 16. Use a seeded LOCKED account (Q5) to test before C4 exists.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D1] Start Trip, pickup transitions, Complete + safe settlement' --label 'lane:L4,area:BE,wave:W2,size:L,tier:1' --body 'Task **D1** (L, 4 pts)

**Done when:** Start is refused after two paid trips today or without location permission; NO_SHOW only after ARRIVED plus 3 minutes; Complete is refused while a booking is unresolved (`UNRESOLVED_BOOKINGS`); settlement is one transaction and rolls back on failure.

### Build brief

GOAL: Build Start Trip, the pickup transitions, and Complete Trip with safe settlement. The gates here are the most testable logic in the system.

BUILD:
1. TripService.start(journeyId, {locationPermission, position}) (UC-12), in this order: departure time reached by Clock; at least 1 CONFIRMED booking; driver has fewer than 2 paid trips today (DAILY_TRIP_LIMIT_REACHED, FR 6.4); location permission (LOCATION_PERMISSION_REQUIRED, FR 7.11); a GPS fix is present (UC-12.EX.3). Then Journey.start() -> IN_PROGRESS (FR 6.1), geofence off, emit TripStarted (passengers notified, FR 8.5), tell D2 to begin tracking.
2. TripService.updatePickupStatus(bookingId, next, actor): the driver marks PICKED_UP (FR 6.5), DROPPED_OFF (6.6) and NO_SHOW (6.7: only from ARRIVED and only 3 minutes after ARRIVED by Clock). The system (D2) sets APPROACHING and ARRIVED. NO_SHOW releases the seat, re-tiers the remaining riders and releases the hold (FR 6.8, 5.1.3), emits PickupStatusChanged.
3. TripService.complete(journeyId) (UC-14), ONE transaction: refuse unless every confirmed booking is DROPPED_OFF, NO_SHOW or UNPAID (UNRESOLVED_BOOKINGS, FR 6.2); journey and its confirmed bookings -> COMPLETED (6.3); final fares at actual headcount (FareService.finalFare); for each rider deduct the held fare from the passenger wallet and credit the driver'\''s wallet (FR 10.5; money moves user to user, per the 13 Oct decision); a booked-on-trust shortfall becomes a Debt and LOCKED and the booking UNPAID (FR 6.9, 10.7, via C4); Driver.incrementDailyTrips() and Passenger.incrementCompletedRides() (FR 6.10); emit TripCompleted. Any failure rolls everything back (UC-14.EX.2).

RULES:
- Use Clock for every time check; never new Date().
- Complete must be safe to retry: a second call after success is ILLEGAL_STATE_TRANSITION, not a second deduction.

INTERFACE:
- POST /api/journeys/:id/start { locationPermission, position }
- POST /api/bookings/:id/pickup-status { status }
- POST /api/journeys/:id/complete

ERROR CODES TO USE (from server/src/errors/AppError.ts):
DAILY_TRIP_LIMIT_REACHED, LOCATION_PERMISSION_REQUIRED, ILLEGAL_STATE_TRANSITION, UNRESOLVED_BOOKINGS, FORBIDDEN, NOT_FOUND

TESTS TO WRITE:
- Gates: 1 vs 2 paid trips, permission missing, no GPS fix, no confirmed booking, before departure time.
- NO_SHOW at 2:59 after ARRIVED -> ILLEGAL_STATE_TRANSITION, at 3:00 allowed (FakeClock); NO_SHOW before ARRIVED rejected.
- Complete with one booking still PICKED_UP -> UNRESOLVED_BOOKINGS; with a failing wallet write nothing changes; double-complete does not double-charge.
- Basis-path tests for updatePickupStatus live in task Q2.

READ FIRST:
- UC-12, UC-13, UC-14 (flows, AC, EX)
- FR 5.1.3, 6.1-6.10, 7.1, 7.11, 8.5, 10.5, 10.7, NFR-6.2, NFR-3.4
- state machines B and C

DO NOT DO IN THIS TASK:
- Streaming positions (D2).
- Rating (E1): rating is a separate step used by both parties.

**Branch:** `feat/D1-start-trip-pickup-transitions-complete`
**PR title:** `[D1] Start Trip, pickup transitions, Complete + safe settlement`
**Depends on:** C3, C2, F15, K3, K4
**Owns:** server/src/services/TrackingService.ts, server/src/controllers/TrackingController.ts, server/src/routes/trips.routes.ts
**Traces to:** UC-12, UC-13, UC-14, UC-12.EX.1, UC-12.EX.2, UC-14.EX.1, UC-14.EX.2, FR 6.1, FR 6.2, FR 6.4, FR 6.5, FR 6.6, FR 6.7, FR 6.8, FR 6.9, FR 6.10, FR 7.11

**Watch out:** Plan risks 3, 12 and 13. `updatePickupStatus` is a Lab 4 basis-path candidate (Q2).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D2] Socket.IO rooms, participant check, location stream' --label 'lane:L4,area:BE,wave:W2,size:L,tier:1' --body 'Task **D2** (L, 4 pts)

**Done when:** Only the driver and CONFIRMED passengers can join a journey room (checked on the server before joining); a position at least every 5 seconds is stored as `LocationUpdate` and fanned out; sharing stops within 30 seconds of Complete, cancel or no-show.

### Build brief

GOAL: Stream the driver'\''s location to the right people and nobody else, and stop on time.

BUILD:
1. Socket handlers in server/src/realtime/handlers/: journey:join checks the caller is the journey'\''s driver or a CONFIRMED passenger of a booking on an IN_PROGRESS journey, then joins journey:<id> (NFR-5.5, FR 7.3). Anything else is refused with a FORBIDDEN error event.
2. location:update from the driver (at least every 5 s, NFR-1.4): validate, store a LocationUpdate, fan out to the room with ts and accuracyM. Reject updates from anyone else.
3. On each update compute the distance in metres and ETA to each confirmed passenger'\''s pickup point (FR 7.5, 7.6; straight-line with an average speed is acceptable, config). Within PROXIMITY_M (300) set that booking APPROACHING and emit; within an arrival radius set ARRIVED (FR 7.7, 7.8) through TripService.updatePickupStatus.
4. Stop sharing for a booking when it becomes COMPLETED, CANCELLED, NO_SHOW or UNPAID (FR 7.10); stop collecting and sharing for the whole journey within 30 SECONDS of completion and delete its LocationUpdates (FR 7.12, NFR-5.4, SRS section 6). Also stop on journey cancel.

RULES:
- The 30 s figure is the current SRS value (FR 7.12, NFR-5.4); earlier drafts said 10 s. Read it from config SHARING_STOP_SECONDS.
- Precise location is collected only while a journey is LIVE/OPEN/FULL/IN_PROGRESS (NFR-5.3).

INTERFACE:
- client -> server: location:update { journeyId, lat, lng, accuracyM, ts }
- server -> room journey:<id>: location:update, pickup:status, journey:status

ERROR CODES TO USE (from server/src/errors/AppError.ts):
FORBIDDEN, AUTH_REQUIRED, TRIP_NOT_ACTIVE

TESTS TO WRITE:
- A confirmed passenger joins and receives; a PENDING passenger, a passenger of another journey and a logged-out socket are refused.
- 300 m boundary: 301 m stays WAITING, 300 m becomes APPROACHING; stop times with FakeClock: updates after completion + 30 s are dropped.
- Throttle: an update faster than 1 per second is ignored.

READ FIRST:
- UC-15 (flow, EX.1, EX.2)
- FR 7.1-7.12, NFR-1.4, NFR-5.1, NFR-5.3-5.5
- K7 foundation
- Plan tab risks 11 and 12

DO NOT DO IN THIS TASK:
- Stale and low-accuracy indicators (computed on the client in D6 from ts and accuracyM).

**Branch:** `feat/D2-socket-io-rooms-participant-check`
**PR title:** `[D2] Socket.IO rooms, participant check, location stream`
**Depends on:** F8, F7c, K7, F15, K4
**Owns:** server/src/realtime/handlers/**
**Traces to:** UC-15, FR 7.2, FR 7.3, FR 7.9, FR 7.10, FR 7.12, NFR-1.4, NFR-5.4, NFR-5.5

**Watch out:** Plan risks 11 and 12: test all three exits.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D3] Notifications: deliver, list, mark read, push preference; predefined messages' --label 'lane:L4,area:BE,wave:W2,size:M,tier:2' --body 'Task **D3** (M, 2 pts)

**Done when:** Domain events become persisted notifications within 10 seconds; quick messages accept only the predefined list (no free text); a message on an ended booking returns `TRIP_NOT_ACTIVE`; delivery failure retries with back-off and keeps the record; a user can list their notifications (newest first, unread count), mark one or all as read, and turn push on or off (UC-22).

### Build brief

GOAL: Turn events into stored notifications, deliver them, and handle the three predefined messages. Notification is not a use case (13 Oct): each flow has its own '\''system notifies'\'' step and this service is the shared implementation behind them.

BUILD:
1. NotificationService subscribes to K6 events and creates a Notification (type, message, target user, isRead = false), then delivers it: socket notification:new to user:<id> if connected, else PushAdapter.send, else it simply waits in the inbox until next login (FR 8.2, stored for the next login). On delivery failure retry with back-off and keep the record (NFR-1.3). Rename: the method is notifyUser() in code.
2. Event to recipient map: BookingRequested -> driver (FR 8.1); confirmed / declined / cancelled -> passenger (8.2); JourneyCancelled -> all confirmed passengers (8.3) and driver if geofence/expired (8.9); FareChanged -> that passenger (8.4); TripStarted -> confirmed passengers (8.5); wallet-check result -> passenger (8.8); DebtRecorded, AccountLocked, AccountUnlocked -> passenger (8.10); a driver accepts an open hop request -> passenger (8.11).
3. GET /api/notifications (newest first, unread count) and POST /api/notifications/:id/read.
4. Quick messages: POST /api/bookings/:id/messages { template }, template one of AT_PICKUP, LATE_2MIN, CANT_FIND (texts from FR 8.6.1). Sender must be the booking'\''s driver or passenger; booking must be CONFIRMED and journey not COMPLETED, else TRIP_NOT_ACTIVE (UC-16.EX.1). Store a QuickMessage and notify the counterpart. Reject anything that is not a template key (FR 8.7).
5. Notification management for the user (UC-22): GET /api/notifications (newest first, with the unread count), POST /api/notifications/:id/read, POST /api/notifications/read-all, and GET / PUT /api/notifications/preferences { push: boolean } stored as User.pushEnabled (default true; honoured only when the pushNotifications flag is on, FR 8.13).

RULES:
- Deliver within 10 seconds of the event (NFR-1.3).
- A failed notification must never roll back the booking or payment that caused it (handlers run after commit).

INTERFACE:
- GET /api/notifications
- POST /api/notifications/:id/read
- POST /api/bookings/:id/messages { template }
- POST /api/notifications/read-all -> 204
- GET /api/notifications/preferences -> { push }
- PUT /api/notifications/preferences { push } -> 204

ERROR CODES TO USE (from server/src/errors/AppError.ts):
TRIP_NOT_ACTIVE, FORBIDDEN, VALIDATION_ERROR, EXTERNAL_SERVICE_UNAVAILABLE

TESTS TO WRITE:
- One test per event type checks recipient and text; a failing push adapter still leaves the stored notification and retries (FakeClock).
- Quick message on an ended booking -> TRIP_NOT_ACTIVE; a template not in the list -> VALIDATION_ERROR; a stranger -> FORBIDDEN.
- Mark-all-read sets every notification of the caller read and no one else'\''s; marking another user'\''s notification -> FORBIDDEN; the push preference round-trips and defaults to on; list is newest first with a correct unread count (UC-22 main flow, AC.1 empty list).

READ FIRST:
- UC-16 (flow, EX) and the notify steps of UC-5, 7, 10, 11, 12, 13, 15, 20
- FR 8.1-8.11, NFR-1.3
- K6 events, K5 adapters
- UC-22 Manage Notifications (flow, AC, EX.1)
- FR 8.12, 8.13

DO NOT DO IN THIS TASK:
- Notification screens (D7).
- Free-text chat (out of scope).

**Branch:** `feat/D3-notifications-deliver-list-mark-read`
**PR title:** `[D3] Notifications: deliver, list, mark read, push preference; predefined messages`
**Depends on:** F7c, K5, K6, F15, K4
**Owns:** server/src/services/NotificationService.ts, server/src/controllers/NotificationController.ts, server/src/routes/notifications.routes.ts, server/src/adapters/push/**
**Traces to:** UC-16, UC-22, UC-16.EX.1, UC-22.EX.1, FR 8.1, FR 8.2, FR 8.4, FR 8.5, FR 8.6, FR 8.7, FR 8.10, FR 8.12, FR 8.13, NFR-1.3

**Watch out:** Controller method is `notifyUser()` in code because Object.notify() is final.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D4] Jobs: expire, auto-decline, no-show, stop-sharing' --label 'lane:L4,area:BE,wave:W3,size:M,tier:2' --body 'Task **D4** (M, 2 pts)

**Done when:** Each sweep reads deadlines stored on rows (not in-memory timers), survives a restart, and is covered by a `FakeClock` test.

### Build brief

GOAL: Run the timers: expire, auto-decline, reset the daily counter, stop sharing.

BUILD:
1. Register each as a scheduleSweep (K6): (1) every 60 s ExpiryHook.run() from B4 (LIVE journeys with no confirmed booking past the window -> EXPIRED); (2) every 60 s auto-decline PENDING bookings whose journey departure time has passed -> CANCELLED and notify (FR 5.5, UC-10.EX.1); (3) when 3 minutes pass after a booking is ARRIVED, emit NoShowWindowOpened so the driver'\''s No-show button enables (FR 6.7; the server guard in D1 stays authoritative); (4) every 10 s purge sharing for journeys COMPLETED or CANCELLED more than the sharing-stop window ago (FR 7.12).
2. (5) 00:00 Asia/Singapore: Driver.resetDailyTripCounter() for all drivers (design model). Add a lastPaidTripDate check in D1 so a missed run can never wrongly block a driver; that column is a schema change, so ask the schema owner (hot spot).

RULES:
- Each sweep must be idempotent: running twice in a row changes nothing the second time.
- Use Clock, not setTimeout arithmetic, so FakeClock tests work.

TESTS TO WRITE:
- FakeClock tests for each sweep at just-before and just-after its boundary; a failing sweep does not stop the others.

READ FIRST:
- UC-4.EX.3, UC-10.EX.1, UC-13.AC.1
- FR 3.5, 5.5, 6.7, 7.12
- K6 job runner

DO NOT DO IN THIS TASK:
- The services the sweeps call (B4, C3, D1, D2).

**Branch:** `feat/D4-jobs-expire-auto-decline-no`
**PR title:** `[D4] Jobs: expire, auto-decline, no-show, stop-sharing`
**Depends on:** D1, B4, K6, F15, K3
**Owns:** server/src/jobs/*.job.ts
**Traces to:** UC-4.EX.3, UC-10.EX.1, UC-13, FR 3.5, FR 5.5, FR 6.7, FR 7.12

**Watch out:** Plan risk 4.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D5] FE: driver Active Trip' --label 'lane:L4,area:FE,wave:W3,size:L,tier:1' --body 'Task **D5** (L, 4 pts)

**Done when:** Live map, trips-today counter, approaching banner, per-passenger status, Picked Up / No-Show (enabled only when allowed), Complete.

### Build brief

GOAL: Build the driver'\''s Active Trip screen.

BUILD:
1. Start Trip button on Live/Waiting calls start; if permission or GPS fix is missing show the UC-12.EX.2 / EX.3 sentence and stay put.
2. Active Trip: map with the driver'\''s own position (send location:update every 5 s while the screen is open; request a screen wake lock), the ordered list of confirmed pickup points each with distance in metres, ETA and status chip (FR 7.4-7.6).
3. Per passenger actions: Picked Up, Dropped Off, and No-show (enabled only after ARRIVED + 3 min, from NoShowWindowOpened). Complete Trip is disabled until every booking is DROPPED_OFF, NO_SHOW or UNPAID (UC-14.EX.1).
4. Show the low-accuracy banner if accuracy is worse than 50 m (NFR-1.6).

RULES:
- Destructive actions (No-show, Complete) sit behind a confirmation dialog.

TESTS TO WRITE:
- Tests: Complete disabled until all resolved; No-show disabled before the window; gate errors show their sentences.

READ FIRST:
- UC-12, UC-13, UC-14, UC-15
- FR 6.5-6.8, 7.4-7.6, NFR-1.6
- mockups (Plan tab screen table)

**Branch:** `feat/D5-fe-driver-active-trip`
**PR title:** `[D5] FE: driver Active Trip`
**Depends on:** D1, D2, F15, K8, K9
**Owns:** client/src/pages/trips/ActiveTripDriver.tsx
**Traces to:** UC-12, UC-13, UC-14, UC-15, FR 7.4, FR 7.5, FR 7.6

**Watch out:** Plan risk 10.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D6] FE: passenger Active Trip + quick-message sheet' --label 'lane:L4,area:FE,wave:W3,size:L,tier:1' --body 'Task **D6** (L, 4 pts)

**Done when:** Driver position and '\''arriving in ~2 min · 650 m'\''; stale-location banner at 15 s and low-accuracy banner above 50 m; the three predefined messages.

### Build brief

GOAL: Build the passenger'\''s Active Trip screen and the quick-message sheet.

BUILD:
1. Live map showing only the driver'\''s position (and my pickup point), ETA and distance to my pickup, status chip WAITING / APPROACHING / ARRIVED (FR 7.7, 7.8). Subscribe with useLiveLocation.
2. Stale indicator when the last update is 15 s old or more, showing its age (NFR-1.5, UC-15.EX.1); low-accuracy indicator when accuracy is worse than 50 m (NFR-1.6, UC-15.AC.1).
3. Quick-message sheet with exactly the three options (FR 8.6.1); sending an expired booking shows the TRIP_NOT_ACTIVE sentence (UC-16.EX.1). No free text (FR 8.7).
4. Cancel Booking is hidden once the trip is IN_PROGRESS; say '\''message your driver'\'' instead (UC-11.EX.1).

RULES:
- The map disappears the moment my booking becomes COMPLETED, CANCELLED, NO_SHOW or UNPAID (FR 7.10).

TESTS TO WRITE:
- Tests with a fake socket: update at t=0, nothing for 15 s -> stale banner with age; accuracy 51 m -> banner; message sheet lists exactly three options.

READ FIRST:
- UC-15, UC-16
- FR 7.7-7.10, 8.6.1, 8.7, NFR-1.5, NFR-1.6
- mockup F12d

**Branch:** `feat/D6-fe-passenger-active-trip-quick`
**PR title:** `[D6] FE: passenger Active Trip + quick-message sheet`
**Depends on:** D2, F15, K8, K9, F12d
**Owns:** client/src/pages/trips/ActiveTripPassenger.tsx, client/src/components/QuickMessageSheet.tsx
**Traces to:** UC-15, UC-16, UC-15.EX.1, FR 7.7, FR 7.8, FR 7.9, FR 8.6.1, NFR-1.5, NFR-1.6

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[D7] FE: Trip Complete + Notifications screen and bell' --label 'lane:L4,area:FE,wave:W3,size:M,tier:2' --body 'Task **D7** (M, 2 pts)

**Done when:** Final fare and per-passenger outcomes; the bell (using `useNotifications` from K7) lists persisted notifications, including those missed while offline.

### Build brief

GOAL: Build the Trip Complete screen and the notification bell.

BUILD:
1. Trip Complete: shows the final fare and outcome, a notice that live location sharing stops within 30 seconds (FR 7.12), and a prompt to rate (opens the Rate screen from E2). It is a separate screen from the driver'\''s Complete action (13 Oct).
2. Notification bell in the page shell (K8 PageShell): unread count, a list from GET /api/notifications, mark as read, new items arriving through notification:new with a toast.
3. Handle the push permission ask politely (not on first load).
4. Notifications screen (/notifications, UC-22): the list newest first with an unread badge; tapping one opens it, marks it read and links to the booking, trip or wallet it concerns; Mark all as read; a push on/off toggle (when the browser denies permission, explain it and keep in-app only, UC-22.AC.2); empty state (UC-22.AC.1) and an error with Retry (UC-22.EX.1). The bell in the header opens this screen.

RULES:
- Notifications must appear within 10 s of the event (NFR-1.3): do not poll slowly; use the socket and fall back to a 30 s poll if the socket is down.

TESTS TO WRITE:
- Tests: unread badge updates when an event arrives; marking read decrements it; the 30 s notice renders.
- Tests: empty state, mark-all-read clears the badge, push denied shows the explanation, load error shows Retry.

READ FIRST:
- UC-14
- FR 7.12, 8.2, NFR-1.3
- mockup F12d
- UC-22 Manage Notifications
- FR 8.12, 8.13

**Branch:** `feat/D7-fe-trip-complete-notifications-screen`
**PR title:** `[D7] FE: Trip Complete + Notifications screen and bell`
**Depends on:** D2, D3, F15, K8, K9
**Owns:** client/src/pages/trips/TripComplete.tsx, client/src/components/NotificationBell.tsx
**Traces to:** UC-14, UC-22, FR 8.2, FR 8.12, FR 8.13, FR 7.10

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[E1] History + Rating services' --label 'lane:L3,area:BE,wave:W2,size:M,tier:2' --body 'Task **E1** (M, 2 pts)

**Done when:** Ratings are 1-5 with an optional comment up to 200 characters, once per user per completed booking (`ALREADY_RATED`); the average is recomputed to one decimal; history is newest first and includes NO_SHOW and UNPAID.

### Build brief

GOAL: Build history and ratings.

BUILD:
1. HistoryService.list(userId) (UC-19): the user'\''s past journeys (driver) and bookings (passenger) in reverse chronological order with status, pickup outcome (including NO_SHOW and UNPAID) and the fare / payment outcome (FR 9.4, 9.5). Empty list is a normal result (UC-19.AC.1).
2. paymentHistoryIndicator(userId): derived from the user'\''s UNPAID bookings (FR 9.6); returned on match cards and booking detail.
3. RatingService.rate(raterId, bookingId, {stars, comment}) (UC-19, rating flow): the booking must be COMPLETED and the rater a participant (driver or passenger); one rating per user per booking (ALREADY_RATED, FR 9.2); stars 1-5, comment at most 200 characters (FR 9.1, 9.1.1). Recompute the ratee'\''s average to one decimal place and store User.avgRating (FR 9.3).
4. Rating is part of Manage Trip History (UC-19, merged 13 Oct): it is reached from the Trip Complete prompt or My Trips, and does not depend on the driver'\''s Complete action.

RULES:
- No moderation of comments in v1 (UC-19 assumption), but strip control characters and never render comments as HTML.

INTERFACE:
- GET /api/history
- POST /api/bookings/:id/ratings { stars, comment? } -> 201

ERROR CODES TO USE (from server/src/errors/AppError.ts):
ALREADY_RATED, ILLEGAL_STATE_TRANSITION, VALIDATION_ERROR, FORBIDDEN, NOT_FOUND

TESTS TO WRITE:
- Rate before completion -> ILLEGAL_STATE_TRANSITION; second rating by the same user -> ALREADY_RATED; 0 and 6 stars -> VALIDATION_ERROR; 201-char comment rejected.
- Average: ratings 5 and 4 -> 4.5; 5, 5, 4 -> 4.7 (rounding).
- History order and the presence of NO_SHOW / UNPAID entries.

READ FIRST:
- UC-19 (view and rate flows, EX)
- FR 9.1-9.6
- Rating and Booking in the design model

DO NOT DO IN THIS TASK:
- Screens (E2).

**Branch:** `feat/E1-history-rating-services`
**PR title:** `[E1] History + Rating services`
**Depends on:** F7c, C3, F15, K3, K4
**Owns:** server/src/services/HistoryService.ts, server/src/controllers/HistoryController.ts, server/src/services/RatingService.ts, server/src/controllers/RatingController.ts, server/src/routes/history.routes.ts, server/src/routes/ratings.routes.ts
**Traces to:** UC-19, UC-19.EX.1, UC-19.EX.2, FR 9.1, FR 9.1.1, FR 9.2, FR 9.3, FR 9.4, FR 9.5, FR 9.6

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[E2] FE: My Trips / History + Rate User' --label 'lane:L3,area:FE,wave:W2,size:M,tier:2' --body 'Task **E2** (M, 2 pts)

**Done when:** Reverse-chronological list with status chips and fare; Cancel Booking for upcoming bookings; Rate screen with 5 stars, a 200-character comment limit, disabled once rated.

### Build brief

GOAL: Build My Trips / History and the Rate User screen.

BUILD:
1. My Trips: list from GET /api/history, newest first, each row with date, route, status chip, pickup outcome and fare / payment outcome (NO_SHOW and UNPAID visible, FR 9.5); tap for details. Upcoming bookings show a Cancel button (UC-11) that is hidden once the journey has started. Empty state and an error with Retry (UC-19.AC.1, EX.1).
2. Rate User: 1-5 stars, optional comment with a 200-character counter; the Rate button is disabled if already rated, with the ALREADY_RATED sentence (UC-19.EX.2). Reachable from Trip Complete and from a completed trip in My Trips.

RULES:
- Show the payment-history indicator wherever a user is shown.

TESTS TO WRITE:
- Tests: empty state, error + retry, already-rated disabled state, comment limit.

READ FIRST:
- UC-19, UC-11
- FR 9.1-9.5
- mockup F12c

**Branch:** `feat/E2-fe-my-trips-history-rate`
**PR title:** `[E2] FE: My Trips / History + Rate User`
**Depends on:** E1, F15, K8, K9, F12c
**Owns:** client/src/pages/trips/MyTrips.tsx, client/src/pages/trips/RateUser.tsx
**Traces to:** UC-19, UC-11, FR 9.4, FR 9.5

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[Q1] Lab 4 black-box tests: fare equivalence classes and boundaries' --label 'lane:L3,area:QA,wave:W3,size:M,tier:1' --body 'Task **Q1** (M, 2 pts)

**Done when:** Equivalence classes (invalid, 1, 2-3, above max riders) and boundaries (0, 1, 2, 3, 4) with a minimised case set, executed and recorded as Test Input / Expected Output / Actual Output.

### Build brief

GOAL: Lab 4 black-box testing of the fare calculation: derive the cases, run them, record them.

BUILD:
1. Pick the '\''control class'\'' for the fare logic (FareController + FareService, tell your supervisor, Plan risk 18).
2. Equivalence classes for calculateFare(riders): invalid (below 1), one rider, two to three riders, invalid (above 3). Boundary values: 0, 1, 2, 3, 4. Minimise the set: one case per class plus each boundary, no duplicates.
3. Write them as vitest tests in FareService.test.ts, and as a table in docs/tests/black-box-fare.md with columns Test Input, Expected Output, Actual Output (copy the actual output from a real run).
4. Also cover the retier effect: a second rider changes the first rider'\''s fare from 300 to 200 cents.

RULES:
- Expected outputs come from the SRS (FR 5.1.1, 5.1.2), not from reading the code you are testing.

TESTS TO WRITE:
- Run npm test; the table'\''s Actual Output column matches the run. Break the code on purpose (change 200 to 250) and confirm a case fails.

READ FIRST:
- Lab 4 manual 3.2.1, 3.2.3, 3.2.4
- FR 5.1-5.2
- task C1

**Branch:** `feat/Q1-lab-4-black-box-tests`
**PR title:** `[Q1] Lab 4 black-box tests: fare equivalence classes and boundaries`
**Depends on:** C1
**Owns:** server/src/services/FareService.test.ts, docs/tests/black-box-fare.md
**Traces to:** Lab4 §3.2.1, Lab4 §3.2.3, Lab4 §3.2.4, FR 5.1

**Watch out:** Plan risk 18: tell your supervisor FareController + FareService is the '\''control class'\''.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[Q2] Lab 4 basis-path tests: updatePickupStatus + match filter chain' --label 'lane:L2,area:QA,wave:W3,size:M,tier:1' --body 'Task **Q2** (M, 2 pts)

**Done when:** A control flow graph, cyclomatic complexity and an independent-path test set for each of the two methods, executed with results recorded.

### Build brief

GOAL: Lab 4 white-box testing: basis-path tests for two methods with real branching.

BUILD:
1. Method 1: TripService.updatePickupStatus (D1). Method 2: the match filter chain in MatchingService (B5b). (The task'\''s file name says TrackingService; the method lives in TripService.)
2. For each: draw the control flow graph, compute cyclomatic complexity V(G) = edges - nodes + 2, list V(G) independent paths, and write one test per path with its input and expected output.
3. Record each in docs/tests/basis-path.md and implement the tests as *.paths.test.ts; record Actual Output from a real run.

RULES:
- Every path test must be able to fail: change a condition in the code and a test breaks.

TESTS TO WRITE:
- V(G) tests exist for each method; the table lists node numbers on each path.

READ FIRST:
- Lab 4 manual 3.2.2-3.2.4
- FR 6.5-6.8, 4.2, 4.7, 4.9
- tasks D1, B5b

**Branch:** `feat/Q2-lab-4-basis-path-tests`
**PR title:** `[Q2] Lab 4 basis-path tests: updatePickupStatus + match filter chain`
**Depends on:** D1, B5b
**Owns:** server/src/services/TripService.paths.test.ts, server/src/services/MatchingService.paths.test.ts, docs/tests/basis-path.md
**Traces to:** Lab4 §3.2.2, Lab4 §3.2.3, Lab4 §3.2.4, FR 6.7

**Watch out:** Plan risk 19.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[Q3] Integration tests: happy path + each error code' --label 'lane:L4,area:QA,wave:W3,size:L,tier:2' --body 'Task **Q3** (L, 4 pts)

**Done when:** supertest against a test database: register -> go live -> request -> match -> book -> start -> complete -> settle; plus one test per `ErrorCode` that a route can raise; includes two concurrent bookings for the last seat.

### Build brief

GOAL: Integration tests: the whole happy path through the real routes and database, plus one test for every error code a route can return.

BUILD:
1. supertest against a test database: register -> verify (code from the fake email) -> login -> driver saves profile and preset -> go live -> passenger requests hop -> match -> top up -> preview -> book -> driver accepts -> start -> pickup -> drop-off -> complete -> wallets settle -> rate.
2. A table-driven test that asserts, for every ErrorCode a route can raise, the HTTP status and the standard error shape.
3. Two concurrent bookings for the last seat: exactly one CONFIRMED (NFR-3.1).

RULES:
- Use FakeClock and the K5 fakes; no real network.

TESTS TO WRITE:
- Suite runs under 2 minutes; breaking any one rule (e.g. skip the seat check) fails at least one test.

READ FIRST:
- Lab 4 manual 3.2.4
- NFR-3.1
- Plan tab risk 1
- K4 helpers

**Branch:** `feat/Q3-integration-tests-happy-path-each`
**PR title:** `[Q3] Integration tests: happy path + each error code`
**Depends on:** A2, C3, D1, K4
**Owns:** server/test/integration/**
**Traces to:** Lab4 §3.2.4, NFR-3.1

**Watch out:** Plan risk 1.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[Q4] PWA install, wake-lock, offline shell' --label 'lane:L4,area:FE,wave:W3,size:M,tier:3' --body 'Task **Q4** (M, 2 pts)

**Done when:** The app is installable on a phone; a screen wake lock is requested during an active trip where supported; an offline shell loads instead of a browser error.

### Build brief

GOAL: Make the web app installable and keep the screen on during a trip.

BUILD:
1. Complete the web manifest (name, icons 192/512, theme colour, display: standalone) and a service worker with an offline shell page (precache the app shell; API calls are never cached).
2. Screen wake lock during an active trip (navigator.wakeLock.request('\''screen'\'')), re-requested when the page becomes visible again; tolerate rejection.
3. Check installability with Lighthouse on the deployed preview (needs HTTPS).

RULES:
- Cut candidate (Tier 3) except the wake lock, which keeps the GPS stream alive during a trip (Plan risk 10).
- Background location is not reliable in a web app: keep the screen on instead of promising background tracking.

TESTS TO WRITE:
- Lighthouse PWA checks pass; offline reload shows the shell with an '\''offline'\'' message, not a browser error.

READ FIRST:
- SRS section 2.4 (platform)
- FR 7.2
- Plan tab risk 10

**Branch:** `feat/Q4-pwa-install-wake-lock-offline`
**PR title:** `[Q4] PWA install, wake-lock, offline shell`
**Depends on:** F9
**Owns:** client/src/pwa/**, client/public/**
**Traces to:** SRS §2.4, FR 7.2

**Watch out:** Plan risk 10.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[Q5] Demo scenario and personas' --label 'lane:L1,area:INFRA,wave:W4,size:S,tier:2' --body 'Task **Q5** (S, 1 pts)

**Done when:** One command resets to a known state: a driver with presets, two passengers (one with a thin wallet), one LOCKED account; the replay-GPS tool drives the trip screens.

### Build brief

GOAL: Build a one-command demo so the demo does not depend on luck.

BUILD:
1. scripts/demo/reset.ts: resets the database to a known state: one driver with two presets and a vehicle, two passengers (one with enough wallet, one with a thin wallet so '\''Booked on trust'\'' and '\''Not enough'\'' can both be shown), one LOCKED account with a debt.
2. Use the replay-GPS tool (K7) to drive the tracking screens from a recorded path along campus roads; no one needs to walk outside.
3. docs/demo-personas.md: who is who, their logins, and the click path for each demo scene.
4. Include one demo user who holds BOTH roles, to show Choose Role and the role switch.

RULES:
- Run it on the deployed environment, not just on a laptop (Plan risks 21, 22, 25).

TESTS TO WRITE:
- Run reset twice then walk the whole script; it works both times.

READ FIRST:
- Lab 5 manual 2.2 and 3.1.4
- K7, K14

**Branch:** `feat/Q5-demo-scenario-and-personas`
**PR title:** `[Q5] Demo scenario and personas`
**Depends on:** K7, K14
**Owns:** scripts/demo/**, docs/demo-personas.md
**Traces to:** Lab5 §2.2, Lab5 §3.1.4

**Watch out:** Plan risks 21, 22, 25.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[Q6] Production environment, deploy pipeline, release tag, freeze' --label 'lane:L1,area:INFRA,wave:W4,size:M,tier:1' --body 'Task **Q6** (M, 2 pts)

**Done when:** A release PR from `dev` to `main` deploys automatically; a tagged version is what gets demoed; the branch is frozen a week before the demo except for bug fixes.

### Build brief

GOAL: Set up production and make the demo version a tagged release.

BUILD:
1. Production environment on the chosen hosts (separate database from the preview), secrets in the host'\''s settings, not the repo.
2. GitHub Actions release.yml: a release PR from dev to main deploys automatically after CI is green; tag the demoed commit v1.0.0.
3. Freeze rule: from one week before the demo only bug-fix PRs are merged to dev; written in CONTRIBUTING.md.

RULES:
- Check the host'\''s sleep / database expiry rules against the demo date (Plan risk 23).

TESTS TO WRITE:
- Merge a trivial release PR and see it live; roll back by redeploying the previous tag.

READ FIRST:
- Lab 5 manual 2.2
- Overview appendix (git workflow)
- F14

**Branch:** `feat/Q6-production-environment-deploy-pipeline-release`
**PR title:** `[Q6] Production environment, deploy pipeline, release tag, freeze`
**Depends on:** F14
**Owns:** deploy/**, .github/workflows/release.yml
**Traces to:** Lab5 §2.2, Overview appendix

**Watch out:** Plan risk 23.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X1] Add passwordHash / EmailVerification to the data dictionary; resync diagrams' --label 'lane:L1,area:DOCS,wave:W0,size:S,tier:1' --body 'Task **X1** (S, 1 pts)

**Done when:** The User entry lists the credential attribute and the dictionary notes the verification-code table; the class model and BCE files are updated to match. Done on 13 Oct: `passwordHash`, `lastActiveRole` and PENDING_VERIFICATION are in the SRS dictionary; still to do: the verification-code record.

### Build brief

GOAL: Fix the data dictionary so it matches what the code and use cases already assume.

BUILD:
1. Add passwordHash (salted hash, never plaintext, NFR-2.2) to the User entry and describe the verification-code table (user, hashed code, expiry, attempts, consumed).
2. Add AccountStatus value PENDING_VERIFICATION and Wallet as owned by User (13 Oct decision), then resync the class model and BCE files that mention them.
3. Note the data-dictionary change in the SRS revision history.

RULES:
- Do this BEFORE F5 so the schema and the document agree.

TESTS TO WRITE:
- Search the SRS and the PlantUML files for '\''Wallet'\'' owned by Passenger: no stale mentions left.

READ FIRST:
- FR 1.4, NFR-2.2
- SRS Appendix A
- 01_class_model.puml, 04_design_class_model.puml

**Branch:** `docs/X1-add-passwordhash-emailverification-to-the`
**PR title:** `[X1] Add passwordHash / EmailVerification to the data dictionary; resync diagrams`
**Depends on:** nothing
**Owns:** docs/srs/data-dictionary/**
**Traces to:** FR 1.4, NFR-2.2, Lab3 §3.2.3

**Watch out:** Do this before F5.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X2] Redraw use case diagram, import dialog map, SRS Appendix B.6' --label 'lane:L1,area:DOCS,wave:W1,size:M,tier:1' --body 'Task **X2** (M, 2 pts)

**Done when:** The use case diagram in the SRS matches the corrected PlantUML (no ExtensionPoint placeholder, goals not outputs); the dialog map is imported into group_project.vpp and appears as Appendix B.6. Done on 13 Oct: the SRS pictures (B.1, B.2, B.3, B.4) and Appendix B.6 text are updated; still to do: redraw them in Visual Paradigm.

### Build brief

GOAL: Redraw the use case diagram from the corrected source and put the dialog map into the SRS.

BUILD:
1. Use the decisions from the Use Case Relationship Review (the page this was built beside): the 18-use-case diagram (v2.1): Request & Book Hop (UC-7+9), Confirm Match (UC-10), Manage Trip History (UC-19, view + rate), Manage Profile (UC-3), Message Counterpart (UC-16), Wallet under NTU User, Complete Trip driver-only, no Notify User use case.
2. Redraw 00_use_case_diagram.puml in Visual Paradigm into group_project.vpp and replace the old drawing in the SRS (Use Case Diagram v2.png is still the Lab 1 version with Request Hop and ExtensionPoint).
3. Import the dialog map (A-D state machines) as Appendix B.6.

RULES:
- The diagram and the written use cases must agree: apply the per-use-case edit list on the Updating the Diagrams page (UC tab, 13 Oct review) and re-trace FR 8.x to the flows that notify.

TESTS TO WRITE:
- Place diagram and use case descriptions side by side and tick every relationship in both.

READ FIRST:
- Lab 2 manual 3.1.1 and 3.3.1
- Lab 5 manual 3.2.2
- 00_use_case_diagram.puml

**Branch:** `docs/X2-redraw-use-case-diagram-import`
**PR title:** `[X2] Redraw use case diagram, import dialog map, SRS Appendix B.6`
**Depends on:** nothing
**Owns:** docs/srs/appendix-b/**
**Traces to:** Lab2 §3.1.1, Lab2 §3.3.1, Lab5 §3.2.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X3] Error-catalog table in SRS Appendix D' --label 'lane:L3,area:DOCS,wave:W3,size:S,tier:2' --body 'Task **X3** (S, 1 pts)

**Done when:** Every code with its HTTP status and the UC-n.EX.m it traces to, generated from `ERROR_CATALOG`.

### Build brief

GOAL: Add the error catalog to the SRS as an appendix.

BUILD:
1. Generate a table from ERROR_CATALOG: code, HTTP status, user message, and the UC-n.EX.m or FR it traces to (the comments in the catalog hold the trace).
2. Add it as Appendix D with one sentence on how errors flow (throw AppError -> central handler -> standard JSON).

RULES:
- Generate it, do not retype it: K12'\''s script produces the table.

TESTS TO WRITE:
- The table row count equals the number of codes in the catalog.

READ FIRST:
- Lab 5 manual 3.2.2
- server/src/errors/AppError.ts

**Branch:** `docs/X3-error-catalog-table-in-srs`
**PR title:** `[X3] Error-catalog table in SRS Appendix D`
**Depends on:** F2
**Owns:** docs/srs/appendix-d/error-catalog.md
**Traces to:** Lab5 §3.2.2, UC-1.EX.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X4] Test cases and results (SRS Appendix E)' --label 'lane:L3,area:DOCS,wave:W4,size:M,tier:1' --body 'Task **X4** (M, 2 pts)

**Done when:** Black-box and white-box case tables with Test Input, Expected Output and Actual Output, plus the integration results.

### Build brief

GOAL: Write up the Lab 4 test cases and results as SRS Appendix E.

BUILD:
1. Black-box table from Q1 and white-box tables from Q2 (Test Input, Expected Output, Actual Output) plus a summary of the Q3 integration run.
2. Add the coverage figure and say which parts have no tests and why.

RULES:
- Copy results from real runs; do not edit Actual Output to match Expected.

TESTS TO WRITE:
- A reviewer can re-run any row and get the same output.

READ FIRST:
- Lab 4 manual 3.2.4
- Lab 5 manual 3.2.2

**Branch:** `docs/X4-test-cases-and-results-srs`
**PR title:** `[X4] Test cases and results (SRS Appendix E)`
**Depends on:** Q1, Q2
**Owns:** docs/srs/appendix-e/**
**Traces to:** Lab4 §3.2.4, Lab5 §3.2.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X5a] Lab 3 §3.3.3: ask an AI for a TODO-only skeleton and critique it' --label 'lane:L2,area:DOCS,wave:W0,size:M,tier:1' --body 'Task **X5a** (M, 2 pts)

**Done when:** The prompt, the AI'\''s output as a separate zip (empty files with TODO comments only), and a critique: what was missed, what was added that was not asked for.

### Build brief

GOAL: Do the Lab 3 section 3.3.3 AI exercise: ask an AI for a skeleton with TODO comments only, then critique it.

BUILD:
1. Write the prompt (design class model + the tech stack), ask a coding agent for empty files with TODO comments only, and save its output as a separate zip in docs/ai/lab3-skeleton/.
2. Critique: what it missed, what it added that you did not ask for, naming mismatches against the design model.
3. Do this BEFORE F15, so the critique is genuinely yours and F15 can borrow the good parts.

RULES:
- Keep the prompt, model name and date for the AI reflection file.

TESTS TO WRITE:
- The zip contains only empty files with TODO comments, and the critique names at least three concrete differences.

READ FIRST:
- Lab 3 manual 3.3.3-3.3.5

**Branch:** `docs/X5a-lab-3-3-3-3`
**PR title:** `[X5a] Lab 3 §3.3.3: ask an AI for a TODO-only skeleton and critique it`
**Depends on:** nothing
**Owns:** docs/ai/lab3-skeleton/**
**Traces to:** Lab3 §3.3.3, Lab3 §3.3.4, Lab3 §3.3.5

**Watch out:** Do this before F15 so the critique is genuinely yours.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X5b] Lab 3 §3.3.1-3.3.2: re-prompt the tech stack and compare' --label 'lane:L3,area:DOCS,wave:W1,size:S,tier:1' --body 'Task **X5b** (S, 1 pts)

**Done when:** The same prompt and model as Lab 2, with the updated class diagram, in a fresh chat; a short answer to whether the recommendation changed and why.

### Build brief

GOAL: Do the Lab 3 section 3.3.1-3.3.2 exercise: ask again for a tech stack with the updated class diagram and compare.

BUILD:
1. Use the SAME prompt and model as Lab 2 in a fresh chat, adding the updated design class diagram.
2. Write a short answer: did the recommendation change, and why.

RULES:
- Keep the original answer unedited for comparison.

TESTS TO WRITE:
- Both answers are saved side by side with the comparison.

READ FIRST:
- Lab 3 manual 3.3.1, 3.3.2, 3.3.5

**Branch:** `docs/X5b-lab-3-3-3-1`
**PR title:** `[X5b] Lab 3 §3.3.1-3.3.2: re-prompt the tech stack and compare`
**Depends on:** nothing
**Owns:** docs/ai/lab3-techstack/**
**Traces to:** Lab3 §3.3.1, Lab3 §3.3.2, Lab3 §3.3.5

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X5c] Lab 4 §3.3.4: the two coding-agent reflections' --label 'lane:L4,area:DOCS,wave:W4,size:M,tier:1' --body 'Task **X5c** (M, 2 pts)

**Done when:** Two reflections: delete-and-regenerate the control class (prompt, materials, iterations, outcome) and one further experiment of your choice.

### Build brief

GOAL: Write the two Lab 4 reflections on using a coding agent.

BUILD:
1. Reflection 1: delete the control class and regenerate it with the agent: prompt, which materials you gave it, how many iterations, outcome.
2. Reflection 2: one more experiment of your own choice (for example, generating tests from the SRS).
3. Keep the AI-use log current from day one so this is not written from memory (Plan risk 30).

RULES:
- Final submission is the SRS file plus the AI reflection file; this belongs in the reflection file.

TESTS TO WRITE:
- Each reflection states what the AI got wrong and what you changed.

READ FIRST:
- Lab 4 manual 3.3.2-3.3.4

**Branch:** `docs/X5c-lab-4-3-3-4`
**PR title:** `[X5c] Lab 4 §3.3.4: the two coding-agent reflections`
**Depends on:** Q1
**Owns:** docs/ai/lab4-reflections/**
**Traces to:** Lab4 §3.3.2, Lab4 §3.3.3, Lab4 §3.3.4

**Watch out:** Keep the AI-use log current from day one (Plan risk 30).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X6] Final traceability matrix into the SRS' --label 'lane:L4,area:DOCS,wave:W4,size:S,tier:3' --body 'Task **X6** (S, 1 pts)

**Done when:** The maintained docs/traceability.csv is rendered into the SRS as a requirement -> design -> code -> test table.

### Build brief

GOAL: Put the final traceability matrix into the SRS.

BUILD:
1. Render docs/traceability.csv as a requirement -> design -> code -> test table in the SRS.
2. Check every UC from 1 to 21 has a class, an endpoint, a screen and a test.

RULES:
- Missing cells are findings: report them, do not hide them.

TESTS TO WRITE:
- A script reports zero UCs with an empty cell.

READ FIRST:
- Lab 5 manual 3.1.6
- Lab 4 manual 3.5.1
- task K13

**Branch:** `docs/X6-final-traceability-matrix-into-the`
**PR title:** `[X6] Final traceability matrix into the SRS`
**Depends on:** K13
**Owns:** docs/srs/traceability/**
**Traces to:** Lab5 §3.1.6, Lab4 §3.5.1

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X7] Demo script and 5-7 minute backup video' --label 'lane:L3,area:DOCS,wave:W4,size:M,tier:1' --body 'Task **X7** (M, 2 pts)

**Done when:** A timed script (use case overview, feature walkthrough, SE practices, one traced use case) and a recorded video made after the freeze.

### Build brief

GOAL: Write the demo script and record a short backup video.

BUILD:
1. A timed script of 5-7 minutes: use case overview, feature walkthrough on the demo data (Q5), software engineering practices (git history, tests, design patterns), and one use case traced end to end.
2. Record the video AFTER the freeze, on the deployed release, as a backup in case the live demo fails.

RULES:
- Rehearse once with a stopwatch (Plan risks 24, 25).

TESTS TO WRITE:
- Script fits the time limit; the video plays on another laptop.

READ FIRST:
- Lab 4 manual 3.4.1 and 3.4.4
- Lab 5 manual 3.3.1

**Branch:** `docs/X7-demo-script-and-5-7`
**PR title:** `[X7] Demo script and 5-7 minute backup video`
**Depends on:** Q6
**Owns:** docs/demo/**
**Traces to:** Lab4 §3.4.1, Lab4 §3.4.4, Lab5 §3.3.1

**Watch out:** Plan risks 24 and 25.

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X10] Renumber the use cases gap-free (UC-1..UC-19) across the documents, board and tests' --label 'lane:L2,area:DOCS,wave:W4,size:S,tier:3' --body 'Task **X10** (S, 1 pts)

**Done when:** UC-9, UC-17 and UC-18 are no longer gaps: the SRS, the use case document, the diagram, `docs/traceability.csv`, test names and the board all use the same new numbers; a script lists every old number it replaced.

### Build brief

GOAL: Make the use case numbers gap-free once the SRS is frozen.

BUILD:
1. Map old to new: UC-1..8 unchanged; UC-10 -> 9, UC-11 -> 10, UC-12 -> 11, UC-13 -> 12, UC-14 -> 13, UC-15 -> 14, UC-16 -> 15, UC-19 -> 16, UC-20 -> 17, UC-21 -> 18, UC-22 -> 19.
2. Write a script that replaces the numbers (including exception ids such as UC-7.EX.3) in the SRS, the use case document, the PlantUML files, docs/traceability.csv, test names and the board task traces, and prints every replacement for review.
3. Do it in one commit after a freeze; keep the old-to-new table in the SRS revision history.

RULES:
- Replace longest numbers first (UC-21 before UC-2) to avoid prefix mistakes.

TESTS TO WRITE:
- Run lint on the board and the traceability check; no UC number appears that is not in the new list.

READ FIRST:
- SRS Appendix B.1 trace table

**Branch:** `docs/X10-renumber-the-use-cases-gap`
**PR title:** `[X10] Renumber the use cases gap-free (UC-1..UC-19) across the documents, board and tests`
**Depends on:** X2
**Owns:** docs/srs/renumber/**
**Traces to:** Lab5 §3.2.2

**Watch out:** Optional and risky: do it only after the team freezes the SRS. The old numbers appear in test names (for example `UC-7.EX.3`).

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X9a] Finish design class diagram: lane 1 classes' --label 'lane:L1,area:DESIGN,wave:W3,size:M,tier:1' --body 'Task **X9a** (M, 2 pts)

**Done when:** User, Driver, Passenger, DriverPreset have final attributes, operations and visibility in group_project.vpp, matching the code.

### Build brief

GOAL: Finish the design class diagram for lane 1 so it matches the code exactly.

BUILD:
1. For User, Driver, Passenger, DriverPreset: copy the final attributes (with types), operations (with parameters and return types) and visibility from the implemented entities (F7a).
2. Edit them in group_project.vpp (Visual Paradigm) and export the lane'\''s part to docs/design/class-diagram/L1/.
3. Check multiplicities and relationships against the Prisma schema.

RULES:
- The diagram describes the code, not the other way round: if they differ, fix whichever is wrong and say which.

TESTS TO WRITE:
- Open the entity file and the diagram side by side: names, types and visibility match.

READ FIRST:
- 04_design_class_model.puml
- Lab 3 manual 3.2.3
- Lab 5 manual 3.2.2

**Branch:** `docs/X9a-finish-design-class-diagram-lane`
**PR title:** `[X9a] Finish design class diagram: lane 1 classes`
**Depends on:** F7a
**Owns:** docs/design/class-diagram/L1/**
**Traces to:** Lab3 §3.2.3, Lab5 §3.2.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X9b] Finish design class diagram: lane 2 classes' --label 'lane:L2,area:DESIGN,wave:W3,size:M,tier:1' --body 'Task **X9b** (M, 2 pts)

**Done when:** Journey, Route, HopRequest, Booking, FareTier, MatchResultSet finished and matching the code.

### Build brief

GOAL: Finish the design class diagram for lane 2 so it matches the code exactly.

BUILD:
1. For Journey, Route, HopRequest, Booking, FareTier, MatchResultSet: copy the final attributes (with types), operations (with parameters and return types) and visibility from the implemented entities (F7b).
2. Edit them in group_project.vpp (Visual Paradigm) and export the lane'\''s part to docs/design/class-diagram/L2/.
3. Check multiplicities and relationships against the Prisma schema.

RULES:
- The diagram describes the code, not the other way round: if they differ, fix whichever is wrong and say which.

TESTS TO WRITE:
- Open the entity file and the diagram side by side: names, types and visibility match.

READ FIRST:
- 04_design_class_model.puml
- Lab 3 manual 3.2.3
- Lab 5 manual 3.2.2

**Branch:** `docs/X9b-finish-design-class-diagram-lane`
**PR title:** `[X9b] Finish design class diagram: lane 2 classes`
**Depends on:** F7b
**Owns:** docs/design/class-diagram/L2/**
**Traces to:** Lab3 §3.2.3, Lab5 §3.2.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X9c] Finish design class diagram: lane 3 classes' --label 'lane:L3,area:DESIGN,wave:W3,size:M,tier:1' --body 'Task **X9c** (M, 2 pts)

**Done when:** Wallet, WalletTransaction, Debt, Rating finished and matching the code.

### Build brief

GOAL: Finish the design class diagram for lane 3 so it matches the code exactly.

BUILD:
1. For Wallet, WalletTransaction, Debt, Rating: copy the final attributes (with types), operations (with parameters and return types) and visibility from the implemented entities (F7c).
2. Edit them in group_project.vpp (Visual Paradigm) and export the lane'\''s part to docs/design/class-diagram/L3/.
3. Check multiplicities and relationships against the Prisma schema.

RULES:
- The diagram describes the code, not the other way round: if they differ, fix whichever is wrong and say which.

TESTS TO WRITE:
- Open the entity file and the diagram side by side: names, types and visibility match.

READ FIRST:
- 04_design_class_model.puml
- Lab 3 manual 3.2.3
- Lab 5 manual 3.2.2

**Branch:** `docs/X9c-finish-design-class-diagram-lane`
**PR title:** `[X9c] Finish design class diagram: lane 3 classes`
**Depends on:** F7c
**Owns:** docs/design/class-diagram/L3/**
**Traces to:** Lab3 §3.2.3, Lab5 §3.2.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
A=(); :
run gh issue create --title '[X9d] Finish design class diagram: lane 4 classes' --label 'lane:L4,area:DESIGN,wave:W3,size:M,tier:1' --body 'Task **X9d** (M, 2 pts)

**Done when:** Notification, LocationUpdate, QuickMessage, CampusLocation, PickupPoint finished and matching the code.

### Build brief

GOAL: Finish the design class diagram for lane 4 so it matches the code exactly.

BUILD:
1. For Notification, LocationUpdate, QuickMessage, CampusLocation, PickupPoint: copy the final attributes (with types), operations (with parameters and return types) and visibility from the implemented entities (F7c).
2. Edit them in group_project.vpp (Visual Paradigm) and export the lane'\''s part to docs/design/class-diagram/L4/.
3. Check multiplicities and relationships against the Prisma schema.

RULES:
- The diagram describes the code, not the other way round: if they differ, fix whichever is wrong and say which.

TESTS TO WRITE:
- Open the entity file and the diagram side by side: names, types and visibility match.

READ FIRST:
- 04_design_class_model.puml
- Lab 3 manual 3.2.3
- Lab 5 manual 3.2.2

**Branch:** `docs/X9d-finish-design-class-diagram-lane`
**PR title:** `[X9d] Finish design class diagram: lane 4 classes`
**Depends on:** F7c
**Owns:** docs/design/class-diagram/L4/**
**Traces to:** Lab3 §3.2.3, Lab5 §3.2.2

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.' "${A[@]}"
