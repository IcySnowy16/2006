# Contributing to Campus Hop

The task list lives on the **Tasks** tab of the _Before You Build_ artifact (https://claude.ai/artifact/BMAh61Fu7urXMeqVvT9nyt). Once GitHub Issues are created from it (`scripts/create-issues.sh`), **the Issues are the source of truth** and the artifact stays as the planning, dependency and scope view.

## The workflow (course rule: Lab Manual Overview, appendix "Using GitHub as one team")

- `main` is stable and releasable. `dev` is the integration branch. **Never commit to `main` or `dev` directly.**
- One task = one branch from the latest `dev`:
  - `feat/<ID>-<short-slug>` for code (example: `feat/C3-booking-service`)
  - `docs/<ID>-<short-slug>` for documents and design work
  - `fix/<ID>-<short-slug>` for bug fixes
- Commits and the PR title start with the task id: `[C3] atomic seat decrement`.
- Open the PR into `dev` with `Closes #<issue>` in the description. Keep PRs to **one task**.
- Before merging, pull the latest `dev` into your branch and re-run the tests.
- A PR needs **green CI and one approval from someone in a different lane**. Merge with **squash**.
- `main` only changes through a release PR from `dev` (task Q6), which is then tagged.

## Definition of done (copied into every PR)

- [ ] `npm run typecheck` and `npm test` pass
- [ ] New behaviour has tests, including the use case's exception flows (`UC-n.EX.m`)
- [ ] Only files listed under the task's **Owns** were changed (or the owner of the shared file was told)
- [ ] Errors are raised with `throw new AppError('CODE')`, never `res.status(...).json(...)` by hand
- [ ] `docs/traceability.csv` row for your use case updated
- [ ] TSDoc on new classes and key public methods

## Avoiding merge conflicts

1. **Stay inside your task's `owns` paths.** Each backend feature has its own service, controller and routes file; each screen has its own page file.
2. **Shared files have one owner.** Do not edit them casually; ask the owner or open a very small PR.
   - `prisma/schema.prisma`, `server/src/routes/index.ts`, `server/src/app.ts`, `server/src/errors/AppError.ts` (the error-code catalog), root and workspace `package.json` and `package-lock.json`: **lane 1**
   - `client/src/router.tsx`: **lane 2**
   - A `package-lock.json` conflict is resolved by re-running `npm install`, never by hand.
3. Merge `dev` into your branch often; small PRs conflict less.

## Release and freeze (task Q6)

- A release is a pull request from `dev` to `main`. CI must be green. Tag the demoed commit `v1.0.0`; the tagged version is what gets demoed. Roll back by redeploying the previous tag.
- **Freeze:** from one week before the demo only bug-fix pull requests are merged to `dev`. No new features, no refactors, no dependency upgrades. The date is written in the team calendar; whoever merges checks it first.

## Lanes (suggested, not locks)

| Lane | Focus                                                           |
| ---- | --------------------------------------------------------------- |
| L1   | Foundation and Account                                          |
| L2   | Pre-journey and matching                                        |
| L3   | Booking, wallet, history, plus test and error-catalog documents |
| L4   | Trip, tracking, notifications                                   |

## Local setup

See `README.md`. The working copy must **not** live inside OneDrive or Dropbox (`node_modules` is tens of thousands of files and sync causes slow installs and locked-file errors).
