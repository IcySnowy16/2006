You are taking over testing and fixing of Campus Hop (NTU SC2006 carpooling web app) in the GitHub repo IcySnowy16/2006, branch `claude/zen-rubin-1xed3z`. Work and push only on that branch. Never push to `main` or to the team repo softwarelab3/2006-SCSA-R3. Never put an API key, password or e-mail address in the repo or a chat. Be brief, and say what you verified and what you did not.

1. Read `testing/handover/HANDOVER.md` first. It has:
   - the panel verdict and the status of each must-fix item
   - the rule decisions waiting on the team
   - the checks, what is open, and how to run the app
   Fixer reports are in `testing/handover/reports/`.

2. The branch has the draft plus two pushed fixes (`1ec4320`). Ten more fixes (fixers A-G) are NOT merged: they wait for a vote. Restore them on a new local branch:
   `git fetch testing/handover/pending-fixes/integration2.bundle integration2:pending-fixes`
   (or `git apply --index testing/handover/pending-fixes/all-fixes-on-1ec4320.patch` on `1ec4320`)
   Then: `npm install`, `npm run build:shared`, `npm run db:generate`, `npm run db:deploy`, `.env` from `.env.example` with `SEED_SYNTHETIC_CATALOG=1`, `SEED_DEMO_USERS=1` and `GOOGLE_MAPS_API_KEY` empty, `npm run dev`, `npm run demo:reset`.
   Check that typecheck, lint (`npx eslint --ignore-pattern '.claude/**' .`), docs:check, test:unit (351 passed, 1 skipped) and test:db (394 passed) match the handover before you change anything.

3. Next steps, in order:
   a. Ask the owner for live feedback on the running app (web on port 5173) and act on it.
   b. Run the 12-agent panel on the pending fixes, exactly as the owner set it up:
      - 2 testers argue the fixes are good and 2 argue they are bad. Each side splits the work, so every fix and every new find (`reports/find-*.json`) is tested once by each side, in the browser with Playwright.
      - Testers share one app and database: no `demo:reset`, no restarts, own accounts only.
      - Only after all 4 reports are in, 8 independent judges vote on each fix (keep or drop), each new find and demo readiness. Majority decides; ties stay ties.
   c. Merge the kept fixes into `claude/zen-rubin-1xed3z`, re-run all checks, push, and write `testing/results-<date>-fixes-panel.md`.
   d. Update the live status page https://claude.ai/artifact/9BZLjAAtsMRzG6JVEuq4yt. It is a Dashboard artifact whose data are 4 attached JSON files: runs, mustfix, cases, health. See "Live page" in `testing/handover/HANDOVER.md` for the columns; to update: upload with Artifact publish asset:true, point `datasets/<id>` `source.url` at the new blob with `if_version`, delete the old blob. Also refresh `testing/handover/Campus_Hop_Test_Status.html`: its data is the JSON block at the top.

4. Open items:
   - The campus fence (needs a reviewed campus boundary file from someone who knows NTU).
   - Forgot password.
   - The 10 unfixed new finds listed in the handover.
   Fixes with a rule decision (fare only falls, 30-minute timeouts, sign-in limits, address owned once verified) must be presented to the team to accept or reject, not decided by you.

Cloud containers restart every hour or two and kill all processes. Check `curl localhost:3000/api/health` before testing, and restart Docker and `npm run dev` if needed.
