# Deploying Campus Hop (tasks F14 and Q6)

**Status: written, NOT yet run on a real host.** The Dockerfile and the release workflow exist; the host has not been chosen (Grill Q3: "one free host that runs Node and Postgres, chosen later"). Everything below is what to check on the day you choose one.

## What gets deployed

One container, built by the `Dockerfile` in the repository root:

- the API (`/api/...`), the WebSocket (`/socket.io`) and the built web app, **all on one origin**, so the login cookie needs no cross-site settings;
- it runs `prisma migrate deploy` on start, then the server.

Plus one PostgreSQL 16 database (managed by the host, or another container).

## Environment variables the host must have

| Name                                                             | Value                                                                 | Why                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`                                                       | `production`                                                          | turns on trust-proxy, hides internal error details, refuses the sample secret |
| `DATABASE_URL`                                                   | the host's Postgres URL (add `?sslmode=require` if the host needs it) |                                                                               |
| `JWT_SECRET`                                                     | 32+ random characters, never the sample value                         | signs login cookies                                                           |
| `COOKIE_SECURE`                                                  | `true`                                                                | the cookie is only sent over https                                            |
| `CLIENT_ORIGIN`                                                  | the public https URL of the app                                       | CORS allows exactly this origin                                               |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | a real mail provider                                                  | verification codes (docs/SETUP.md, "E-mail")                                  |
| `GOOGLE_MAPS_API_KEY`                                            | a restricted key (optional)                                           | real routes; without it the straight-line fake is used                        |
| `CAMPUS_BOUNDARY`                                                | path to the boundary JSON inside the image                            | turns the geofence on                                                         |
| `LOG_LEVEL`                                                      | `info`                                                                |                                                                               |

`PORT` is set by most hosts; the image defaults to 3000. The full list with comments is `.env.example`.

## First deploy, in order

1. Create the database; set the variables above.
2. Deploy the image (the host builds the `Dockerfile`, or pulls the image CI built).
3. Once, seed the fare table and the reviewed campus catalog: `node server/dist/seed/cli.js` in a one-off container/shell with the same variables. (The catalog is only seeded from `server/prisma/data/campus-catalog.reviewed.json`; see docs/SETUP.md, "Campus coordinates".)
4. Open `https://<your-url>/api/health` in a browser: `{"status":"ok", ...}`.
5. On a phone: open the URL, register, check the e-mail arrives, log in (this proves the cookie), and run the replay tool against the URL to prove the WebSocket survives the host's proxy (`npm run replay-gps -- --url https://<your-url> ...`).

## Things to check against the demo date (Plan risks 5, 6, 9, 23)

- **Idle sleep.** Free tiers put a service to sleep after minutes of no traffic; the first request then takes 30 to 60 seconds. Visit the app a few minutes before the demo, or use a cron ping.
- **Database expiry.** Some free Postgres plans delete the database after a fixed time. Write the expiry date next to the demo date.
- **WebSocket.** The host's proxy must pass `Upgrade` requests and not close idle connections under a minute.
- **Region.** Pick the region nearest Singapore.
- **HTTPS.** Required for the browser's geolocation and for installing the app.

## Release

`dev` to `main` by pull request; CI is a required check. `.github/workflows/release.yml` rebuilds the image on every push to `main` and on tags and calls `DEPLOY_HOOK_URL` if you set that secret. Tag the demoed commit `v1.0.0`. Roll back by redeploying the previous tag. From one week before the demo only bug-fix pull requests are merged (CONTRIBUTING.md).
