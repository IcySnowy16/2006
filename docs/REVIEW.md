# How to review a task

Two lenses taken from published reviewer prompts (both MIT licensed: `Jeffallan/claude-skills`, `VoltAgent/awesome-claude-code-subagents`, the `surgeon-reviewer` and `security-reviewer` ones). Nothing is installed from them; this is a plain checklist for people.

## 1. For every finding, answer: "if this ships as it is, what goes wrong, for whom, how bad?"

If you cannot say it in plain words, do not report it. Name the tier:

| Tier           | Meaning                                                                                                 | Example in this repo                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **WILL BREAK** | Wrong behaviour in realistic use: logic error, race, lost money or data, reachable security hole        | Parallel wrong verification codes all counted as attempt 1 (fixed, `AuthService.verify`) |
| **WILL COST**  | Works now, degrades later: N+1 queries, unbounded growth, missing index, timezone assumption            | (none found yet; N+1 and unbounded lists are the usual ones)                             |
| **WILL ROT**   | Works now, makes the next change harder: duplicated rule, hidden coupling, invariant kept by habit only | (none found yet; a rule written twice is the usual one)                                  |

Do not report style, naming or anything a linter catches. For a WILL BREAK, give the input or sequence that triggers it.

## 2. Security order

1. Who may call this? (authentication, then ownership: `requireAuth`, `assertOwner`, `assertParticipant`)
2. What does it accept? (zod schema in `shared`, nothing trusted from the client)
3. What does it return? (never the hash, the code, another person's e-mail or phone)
4. Secrets: none in code or logs. `npm audit --omit=dev --audit-level=high` runs in CI.
5. Money and seats: integer cents, row locks, conditional updates, events after commit.

## 3. Tests

Assert a specific outcome (`toBe(90)`, an error code), not truthiness. Cover the error path and the boundary. No test depends on another's order. Unit tests use fakes; only `*.int.test.ts` touches the database.

A test that fails once and passes on rerun is not "flaky, ignore it": read the failure and fix the cause. Do not add retries. (Example: a test asserted that a button was disabled before the data that decides it had loaded; it passed on a quiet machine and failed under load.) Coverage thresholds are set in `vitest.config.mts` and checked in CI; accessibility checks on the main screens are in `client/src/a11y.test.tsx`.

## 4. Decision

Per task: **Accept**, or **Deny with a reason** naming the file and line. A reason is required for Deny.
