# Fix report: fixer "fixe"

- Worktree: /home/user/2006/.claude/worktrees/agent-a28670618a18e3a4d
- Branch: worktree-agent-a28670618a18e3a4d. Not pushed.
- Commits, on top of 1ec4320:
  - 9d862eb `[B-NA-006] Limit failed sign-ins per e-mail, with a loose per-address ceiling`
  - 35f806d `[C-017] Stop offering and notifying riders who already have a booking`
- Setup note: the worktree started on d905a13, an older commit that does not contain 1ec4320. I ran `git reset --hard 1ec4320` before doing any work, as the brief requires; there were no local changes at that point.

## 1. B-NA-006: sign-in limits were per network address only

**Root cause.** In server/src/security/index.ts:45-56 (old file), `createRateLimiters` used express-rate-limit with its default key, which is the client IP. It counted every request, successful ones included, at 10 a minute for login, register and verify. So everyone on one campus network or in one demo room shared those 10 tries, and someone else's wrong tries got a 429 for a correct sign-in.

**Change**
- server/src/security/index.ts:35-92: each auth endpoint now has two limiters.
  - **Per network address** (`limits.perAddress`): a loose ceiling, checked first.
  - **Per e-mail address**: the key is `ntuEmail`, trimmed and lowercased. A request with no e-mail address is counted against its network address.
- Login, register and verify count only failed attempts (`skipSuccessfulRequests`). Resend counts every request, because each one sends an e-mail (`ONLY_FAILURES`, line 59).
- The network address is keyed with `ipKeyGenerator`, which express-rate-limit v8 requires for IPv6.
- server/src/routes/mount.ts:63-85: `limiterFor` now returns a list of handlers, and all of them go into the middleware chain.
- The error stays `AppError('TOO_MANY_REQUESTS')` through the central error handler, so the response shape is unchanged.

**Decision** (in shared/src/defaults.ts, plus a `DECISIONS` row "Test NA-006"; docs/decisions-defaults.md was regenerated):

| Setting | Value | What counts |
|---|---|---|
| `AUTH_FAILED_PER_EMAIL_PER_MIN` | 10 | Failed sign-in, sign-up or code attempts, per e-mail address. A success does not count. |
| `AUTH_RESEND_PER_EMAIL_PER_MIN` | 5 | Every code e-mail, per e-mail address (same as before, but per e-mail instead of per network address). |
| `AUTH_PER_ADDRESS_PER_MIN` | 100 | Per network address and endpoint, counted the same way as above (failures, or every resend). |

Trade-off for the team: because the per-e-mail limit is not tied to the network address, someone who knows a classmate's e-mail address can lock that classmate out for a minute by sending 10 wrong passwords. The alternative is to key on network address plus e-mail. That stops this lockout, but it does not limit guesses spread across many networks.

**Tests**
- server/test/auth.int.test.ts, three new tests:
  - 11 wrong tries for a made-up e-mail address are refused, then a real user on the same address signs in with 200 (the NA-006 steps).
  - 15 different users, then one user 12 times, all sign in within a minute.
  - The per-e-mail count treats upper case and surrounding spaces as the same address.
- Existing tests still pass: "11th login is TOO_MANY_REQUESTS" and "resend allows 5".
- server/src/security/security.test.ts (new unit test, 5 tests): the defaults, the per-e-mail limit, successes not counted, the per-address ceiling across many e-mail addresses, and resend counting every request.
- The two NA-006 integration tests failed on the old code: the correct login got 429.

## 2. C-017 / C-020 / C-045: a rider with a booking was still offered to drivers and flooded with notifications

**Root cause**
- server/src/services/MatchingService.ts:149-156 (old file): `findRequestsFor` returns every OPEN hop request of an ACTIVE user. A request stays OPEN while its booking is PENDING; it only becomes MATCHED when the driver accepts (BookingService.ts:185). A booking made without `hopRequestId` never changes the request at all.
- JourneyService.ts:88-91 calls `findRequestsFor` on every go-live and sends `RequestAccepted` for each result. So a rider waiting on D1 was shown to D2, D3 and so on as an "Open Hop Request".
- On top of that, server/src/services/NotificationService.ts:109 (old file) stored a new "A driver going your way is live." every time, with no check for an identical one already in the bell. That is how 9 to 35 copies piled up while several testers went live.

**Change**
- MatchingService.ts:34-38 and :161: requests are now skipped when the passenger has a PENDING or CONFIRMED booking on a journey that is LIVE, OPEN, FULL or IN_PROGRESS. This is the same rule that makes `BookingService.book` refuse a second booking with CONFLICT. This one filter covers both the driver's request cards (`requestCards`) and the go-live notifications. The driver's own pending-booking cards are a separate query and are unchanged.
- NotificationService.ts:109-116: the `RequestAccepted` handler does nothing if the rider already has an unread `REQUEST_ACCEPTED` notification with the same link (`/requests/<id>`).

**Decision.** At most one unread "driver is live" message per hop request. After the rider reads it, a different driver going live later is announced again, because that is new information. None is sent while a pending or confirmed booking exists. Each journey sends `RequestAccepted` only once (at go-live), so the same journey can never notify the same request twice. I added no number to defaults.ts because this rule has none.

**Tests** (server/test/matching.int.test.ts, new describe block, 4 tests)
- With a PENDING booking on D1, and again with a CONFIRMED one: D2 goes live through the route, no `RequestAccepted` is sent, no notification is stored, and D2's `/requests` list is empty.
- After a CANCELLED booking, the rider is offered and notified again.
- Three drivers going live leave exactly one REQUEST_ACCEPTED in the bell. After it is marked read, a fourth driver going live adds a second one.
- The PENDING, CONFIRMED and flood tests failed on the old code.

**Not covered**
- C-045 (telling the rider when an open request lapses after 15 minutes) and C-020's countdown or "Choose another ride" on the booking page are separate features. This change only removes the notification flood those testers saw.
- A rider whose trip has COMPLETED, but whose request was never linked to that booking, can still be notified until the request expires (the core8.log case). The request is never marked MATCHED, so fixing that needs a rule for closing the request.

## Checks (after the fix)
- `npm run typecheck`: pass. `npm run lint`: pass.
- `npx prettier --check` on every changed file: pass.
- `npm run test:unit`: 27 files, 338 passed, 1 skipped.
- `DATABASE_URL_TEST=.../campushop_test_fixe npm run test:db`: 21 files, 374 passed.
- `npm run docs:check`: up to date, after `npm run docs` regenerated docs/decisions-defaults.md (committed).

## Not verified
- Not tried in the running app or a browser, and not tried behind the production proxy (`trust proxy`).
- The rate-limit windows still use the real time from express-rate-limit's memory store, not the app's Clock, as before. The store is per server process.
- Two drivers going live at the same moment could each pass the unread check before either one writes, so a rider could still get two notifications. I did not add a lock.
