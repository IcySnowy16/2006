# Architecture (task K12)

Campus Hop is a web app (a PWA) with one API server, one PostgreSQL database and a WebSocket channel. This page says where code goes and how a request travels. Decisions that were argued once are written as short records in [docs/adr](adr/).

## The layers and the one rule

```
client (React PWA)  ──HTTP + WebSocket──▶  server
                                           routes  ─▶  controllers  ─▶  services  ─▶  entities
                                              │            │               │
                                              │            │               ├─▶ adapters  (e-mail, Maps, PayNow, push, GPS)
                                              │            │               └─▶ events    (queued in a transaction, sent after commit)
                                              ▼            ▼
                                        middleware      shared contract  (zod schemas, enums, error codes, endpoint table)
```

**The dependency rule** (enforced by `npm run depcheck`, which fails a pull request that breaks it): code may only depend on layers to its right.

| Layer       | Folder                   | Does                                                                                                            | May not                                         |
| ----------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Entities    | `server/src/entities`    | Plain TypeScript classes with the business rules and the state machines (Journey, Booking, Wallet, FareTier...) | import Express, Prisma, services or controllers |
| Services    | `server/src/services`    | One use case at a time; reads and writes the database (Prisma) inside transactions; raises `AppError`           | import Express, controllers or routes           |
| Controllers | `server/src/controllers` | Read the validated request, call a service, return the contract shape                                           | import Prisma                                   |
| Routes      | `server/src/routes`      | **Generated from the endpoint table**: one `mount(router, ctx, 'name', handler)` per route                      | choose their own path or protection             |
| Adapters    | `server/src/adapters`    | The only code that talks to outside systems; each has a fake for tests                                          | be called from entities                         |
| Shared      | `shared/src`             | The contract the client and server both read                                                                    | import server or client code                    |

There is no repository layer: services use Prisma directly (ADR 0004).

## How a request flows

1. **Security middleware** (helmet, CORS for one origin, cookie parser, rate limits on login/register/verify/resend).
2. **`mount()`** (from `shared/src/api.ts`) builds the chain for this route: `requireAuth` → `requireRole` for the ACTIVE role → extra checks (`requireVerified`, `requireUnlocked`) → **zod validation** of body and query.
3. The **controller** calls a **service**. The service opens a database transaction when it changes more than one row, **locks** the rows that must not race (the journey for seats, the wallet for money), calls **entities** to apply the rules, and queues **events** in an `EventQueue`.
4. After the transaction **commits**, the queue is published on the **event bus**. Listeners (notifications, the realtime gateway) run after the data is saved, and a listener that fails is logged and swallowed, so a notification can never undo a booking.
5. The response is checked against its zod schema (not in production), so the code and the contract cannot drift apart.
6. Any error anywhere is an `AppError` with a code from the catalog; the **central error handler** turns it into `{ code, message, details?, requestId }`. A bug becomes `INTERNAL_ERROR` and the real cause is logged, never sent.

## Folder map

```
shared/src            contract: api.ts (endpoint table), endpoints/*, enums, errors (catalog), realtime, defaults, features
server/src
  config/             environment check that fails fast; campus boundary file
  core/               Clock, Money (integer cents), geo maths, the one PrismaClient, transactions and row locks
  entities/           the domain
  services/           use cases       controllers/  routes/  middleware/  auth/  security/
  adapters/           email, maps, paynow, push, gps  (+ fakes)
  events/  jobs/      event bus; timers (sweeps) that read deadlines stored on rows
  realtime/           Socket.IO gateway and live-location rules
  seed/               catalog file rules, geocoding, demo data
server/prisma         schema.prisma, migrations (with CHECK constraints and append-only triggers), seed.ts
client/src            the web app (see client/README)
docs                  generated: API.md, ERROR-CODES.md, traceability.csv, decisions-defaults.md; written: this file, adr/, tests/, SETUP.md
```

## Rules that the code enforces and the tests prove

- **Money** is whole cents everywhere (`Money`); the database refuses a negative balance or a hold above the balance; the ledger is append-only (a trigger refuses UPDATE and DELETE).
- **Seats** are taken with the journey row locked _and_ a conditional update, so two accepts for the last seat produce one winner.
- **Time** comes from a `Clock`, never `new Date()`, so every deadline (3-minute no-show, 30-second stop, 30-minute contact window) is tested at its boundary.
- **Privacy**: other users are shown by first name; a phone number leaves the server only through `GET /api/bookings/:id/contact`, to a confirmed participant, inside the contact window, and is never logged.
- **Coordinates** of the real campus are never invented: only a reviewed catalog file is seeded.
