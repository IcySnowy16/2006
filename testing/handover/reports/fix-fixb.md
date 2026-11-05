# fix-fixb: C-007 / B-NA-012 / X1 (live driver cannot reach the journey) and C-004 (unverified sign-up claims an address)

- Commit: `6b40e14` on branch `worktree-agent-ac0955d1d2a85b3f2`, worktree `/home/user/2006/.claude/worktrees/agent-ac0955d1d2a85b3f2`. Not pushed.
- Base: the worktree started at d905a13, an ancestor of 1ec4320. I fast-forwarded it with `git reset --hard 1ec4320` (the tree was clean, so nothing was lost), then committed on top.
- Test DB: `campushop_test_fixb`.

## 1. C-007 / B-NA-012 / X1: live driver adds the passenger role, signs in again, cannot get back to the journey

**Root cause.**
- `server/src/services/RoleService.ts:41` (old) refused any choice where `current !== role` while the user was mid-trip.
- After sign-in a both-role user with no `lastActiveRole` has `current = null`. A driver-only user never stores `lastActiveRole`, because a single-role user's role is implied. So choosing DRIVER counted as a "switch" and was refused with "Finish or cancel your trip first", even though DRIVER is the role the live journey needs.
- `server/src/services/AuthService.ts` `login` (old line 123) gave such a user no active role (`null`).

**Change.**
- **New `server/src/services/tripRole.ts`:** `tripRoles(db, userId)` returns the roles the user is on a trip in. As DRIVER: a journey that is LIVE, OPEN, FULL or IN_PROGRESS. As PASSENGER: a PENDING or CONFIRMED booking on such a journey. These are the same conditions `isMidTrip` used before.
- **`RoleService.setActiveRole`:** a choice is refused only if `current !== role`, the user is on a trip, and `role` is not the trip's role. So choosing the trip's role is always allowed, and switching away mid-trip is still `ILLEGAL_STATE_TRANSITION`. `isMidTrip` now calls the helper (same behaviour).
- **`AuthService.login`:** a both-role user who is on a trip in exactly one role signs in acting in that role. Otherwise the remembered role is used, as before.
  - Login also stores that role as `lastActiveRole`. The reason: `requireAuth` prefers the stored role over the token, so a stale stored role would otherwise override it.

**Decision for the team:** sign-in puts a both-role user who is mid-trip into the trip's role, even if they last chose the other one. No number was needed.

**Tests added (`server/test/roles.int.test.ts`):**
- *C-007: live driver adds the passenger role and signs in again.* Checks:
  - sign-in gives `activeRole: 'DRIVER'`;
  - `/api/journeys/mine`, a driver-only route, lists the journey;
  - with a no-role cookie, choosing DRIVER is 200 and choosing PASSENGER is ILLEGAL_STATE_TRANSITION;
  - with a DRIVER cookie, choosing PASSENGER is still refused.
- *C-007: both-role user with a CONFIRMED booking and a stale `lastActiveRole: DRIVER`.* Checks:
  - sign-in gives PASSENGER and stores it;
  - with a no-role cookie, choosing DRIVER is refused and choosing PASSENGER is 200.
- All the existing role tests still pass unchanged: switching is refused mid-trip, a PENDING booking blocks a switch, and choosing the role you are already in is allowed.

## 2. C-004: an unverified sign-up claims the address for good

**Root cause.** `server/src/services/AuthService.ts:45` (old) threw `EMAIL_TAKEN` for any existing row, verified or not. So the first person to sign up owned the address and its password. It did not matter who later entered the code.

**Change (`AuthService.register`):**
- `EMAIL_TAKEN` now happens only when the existing account is no longer `PENDING_VERIFICATION`.
- For a pending account, the same row is updated with the new name, phone, password hash and roles (`lastActiveRole` is reset). The update is conditional on `accountStatus: 'PENDING_VERIFICATION'`, so a verify that lands in between wins and the answer becomes `EMAIL_TAKEN`.
- A fresh code is then sent through the existing `issueCode`, which voids every older code. That also resets the attempt count, because the attempts belong to the new code row.
- The response is `201 { userId }` with the same id. The wallet is kept (one wallet).

**Decision for the team:** "an address is owned only once it is verified; the most recent sign-up for an unverified address wins".
- Known limit: if someone signs up after the real owner, their sign-up's code is the only live one. If the real owner then enters that code, the other person's password wins.
- The owner fixes it by signing up again. Every sign-up voids the earlier codes, so the inbox reader always verifies their own latest sign-up.
- Closing this fully would need the password to be set at verification time, which is a bigger change, so I did not do it.

**Tests:**
- `server/test/auth.int.test.ts`:
  - The old "duplicate e-mail is EMAIL_TAKEN" test now verifies the first account before the second sign-up. It asserts EMAIL_TAKEN, no e-mail sent, name unchanged, and the old password still logs in.
  - New *C-004 replaces name, phone, password, roles and sends a fresh code*. Checks:
    - same userId, one user row, one wallet;
    - two e-mails sent;
    - the old code is VERIFICATION_CODE_INVALID and the fresh code verifies;
    - the first password is INVALID_CREDENTIALS, and the second logs in with the new name and roles.
  - New *C-004 a replacing sign-up resets the attempt count*: after 3 wrong codes (CODE_ATTEMPTS_EXCEEDED), a new sign-up, a resend (204) and the latest code verify fine.
- `server/test/error-codes.int.test.ts`: the EMAIL_TAKEN case verifies the first sign-up before the duplicate. Without that it would now get 201.
- Verify and resend: their existing tests pass unchanged (expiry, attempts, parallel guesses, resend voids old code, unknown address NOT_FOUND, verified no-op).

## Checks (after the fix)

- **Do the new tests catch the bugs?** Yes. With the two service files reverted to HEAD, the 4 new tests failed and the other 50 in the two files passed. With the fix, all 54 pass.
- `npm run typecheck`: pass. `npm run lint`: pass. `npx prettier --check` on the 6 changed files: pass.
- `npm run test:unit`: 26 files, 333 passed, 1 skipped.
- `DATABASE_URL_TEST=.../campushop_test_fixb npm run test:db`: 21 files, 371 passed.
- `npm run docs:check` was stale, because `docs/traceability.csv` now lists `tripRole`. I ran `npm run docs` and committed the regenerated file; `docs:check` now passes.

## Not verified

- I did not run the real app or browser. The client was not changed and I did not click through the flows.
  - **C-007:** the client should go straight to the driver screens because sign-in now returns `activeRole: 'DRIVER'`. Its Choose Role screen, if shown, now succeeds for DRIVER.
  - **C-004:** the sign-up form gets 201 and should go to the verify screen as usual.
- Two sign-ups for the same new address sent at the same moment can still both reach `create`. That race behaves as before this change; I did not test it.
