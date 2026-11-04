# Testing this copy

This repository is a snapshot of the Campus Hop draft (all 84 tasks) for testing. It is not the team repository.

1. Follow "Run it in 10 minutes" in `README.md` (Node 22+, Docker Desktop, `npm install`, `npm run dev`).
2. Put `SEED_SYNTHETIC_CATALOG=1` and `SEED_DEMO_USERS=1` in `.env`, then run `npm run demo:reset`. Every demo login uses the password `demo-password-1` (`docs/demo-personas.md`).
3. Open `testing/Campus_Hop_Test_Log.html` in a browser (double-click it). Work through the cases, then press "Copy results".

Never commit `.env`. API keys go in `.env` only.
