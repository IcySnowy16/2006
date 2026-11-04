# 2006-SCSA-R3

As there's a storage limit, kindly upload all deliverables format in .pdf and .jpeg format.

## Campus Hop code

NTU intra-campus carpooling (a web app, installable as a PWA). The lab deliverables are in `lab1/`, `lab2/`, `lab3/`; the code is in `shared/`, `server/` and `client/`.

### Run it in 10 minutes

You need **Node 22+**, **Docker Desktop** (running) and Git. Keep the folder outside OneDrive.

```bash
npm install
npm run dev
```

That starts Postgres and a fake inbox in Docker, applies the database migrations, and starts the API (http://localhost:3000) and the web app (http://localhost:5173). To try it with sample people and a labelled **[DEMO]** campus: put `SEED_SYNTHETIC_CATALOG=1` and `SEED_DEMO_USERS=1` in `.env` (copied from `.env.example` on first run), then `npm run demo:reset`; every demo login uses the password `demo-password-1` (`docs/demo-personas.md`).

Everything else a person must do (Google Maps key, real e-mail, the campus coordinates, a phone, hosting, GitHub settings) is in **`docs/SETUP.md`**.

### Commands

| Command                                                                         | What it does                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                                                   | everything above, with reload                                                                                                  |
| `npm test`                                                                      | every test: shared, server (unit and database), client                                                                         |
| `npm run test:unit` / `npm run test:db`                                         | without / only the database tests (need Docker)                                                                                |
| `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run depcheck` | the checks CI runs                                                                                                             |
| `npm run docs`                                                                  | regenerate `docs/API.md`, `ERROR-CODES.md`, `traceability.csv`, `decisions-defaults.md` (`docs:check` fails if they are stale) |
| `npm run demo:reset`                                                            | put the database in the known demo state                                                                                       |
| `npm run replay-gps`                                                            | play the driver's route over the live-location channel (no one walks outside)                                                  |
| `npm run db:deploy`, `db:reset`, `db:seed`                                      | migrations, reset, seed                                                                                                        |
| `npm run build`                                                                 | compile shared, server and client                                                                                              |

### Where things are

| Folder                  | What                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/src/`           | The contract client and server both import: the endpoint table (`api.ts`), zod schemas, enums, error catalog, realtime events, the default answers to the open questions (`defaults.ts`), feature flags. |
| `server/src/`           | `entities` (the rules) -> `services` (use cases) -> `controllers` -> `routes`; `adapters` (e-mail, Maps, PayNow, push, GPS, each with a fake); `realtime`; `jobs`; `seed`. See `docs/ARCHITECTURE.md`.   |
| `server/prisma/`        | The schema, migrations (with CHECK constraints and append-only triggers), the seed, and the catalog template.                                                                                            |
| `client/src/`           | The web app: `pages`, `components` (the kit, shown at `/dev/components`), `api` (the only place that calls `fetch`), `hooks`.                                                                            |
| `docs/`                 | `SETUP.md`, `ARCHITECTURE.md`, `adr/`, `tests/` (black-box and basis-path write-ups), generated tables, `BUILD_STATUS.md`.                                                                               |
| `deploy/`, `Dockerfile` | Deployment notes and the production image.                                                                                                                                                               |

Tests sit next to the code they test (`*.test.ts`); database tests are `*.int.test.ts` or `*.paths.test.ts`.

### Rules

- Never hand-write an error response: `throw new AppError('CODE')`. A new code goes in `shared/src/errors.ts` (the server imports it) and `npm run docs` regenerates the table.
- Money is integer cents; times are ISO-8601 UTC strings; time in code comes from a `Clock`.
- The real campus coordinates are never invented: only a reviewed catalog file is seeded.
- See `CONTRIBUTING.md` for branches, pull requests, the release and the freeze.
