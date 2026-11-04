# API

Generated from `shared/src/api.ts` (`npm run docs`): 47 routes. The server mounts exactly these (task F15); the client calls them through typed helpers (task K9).

**Access:** `public` no login; `user` any signed-in user; `driver` / `passenger` only in that ACTIVE role. Every route can also answer `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS` and `INTERNAL_ERROR`, and every non-public route `AUTH_REQUIRED` / `INVALID_TOKEN`; those are not repeated below. Money is whole cents, times are UTC ISO strings.

| Method | Path | Access | What it does | Use cases | Task | Errors (besides the common ones) |
|---|---|---|---|---|---|---|
| `GET` | `/api/features` | public | Which optional features are switched on | - | K15 | - |
| `GET` | `/api/health` | public | Liveness and database check | - | F3 | EXTERNAL_SERVICE_UNAVAILABLE |
| `POST` | `/api/auth/register` | public | Create an account and e-mail a code | UC-1 | A2 | EMAIL_DOMAIN_NOT_ALLOWED, EMAIL_TAKEN, EXTERNAL_SERVICE_UNAVAILABLE |
| `POST` | `/api/auth/verify` | public | Submit the e-mailed code | UC-1 | A2 | VERIFICATION_CODE_INVALID, CODE_ATTEMPTS_EXCEEDED, NOT_FOUND |
| `POST` | `/api/auth/resend` | public | Send a new code | UC-1 | A2 | NOT_FOUND, EXTERNAL_SERVICE_UNAVAILABLE |
| `POST` | `/api/auth/login` | public | Sign in; sets the session cookie | UC-2 | A2 | INVALID_CREDENTIALS, EMAIL_NOT_VERIFIED |
| `POST` | `/api/auth/logout` | user | Sign out | UC-2 | A2 | - |
| `GET` | `/api/auth/me` | user | Who is signed in, roles and active role | UC-2 | A2 | - |
| `POST` | `/api/me/active-role` | user | Choose or switch the active role | UC-2 | A6 | FORBIDDEN, ILLEGAL_STATE_TRANSITION |
| `POST` | `/api/me/roles` | user | Add the passenger role to a driver-only user | UC-3 | A6 | CONFLICT |
| `PUT` | `/api/driver/profile` | user | Save vehicle and PayNow ID; adds the driver role if missing | UC-3 | B1 | - |
| `GET` | `/api/presets` | driver | My presets | UC-3 | B1 | FORBIDDEN |
| `POST` | `/api/presets` | driver | New preset | UC-3 | B1 | FORBIDDEN, NOT_FOUND |
| `PUT` | `/api/presets/:id` | driver | Edit a preset | UC-3 | B1 | FORBIDDEN, NOT_FOUND |
| `DELETE` | `/api/presets/:id` | driver | Delete a preset | UC-3 | B1 | FORBIDDEN, NOT_FOUND, PRESET_IN_USE |
| `GET` | `/api/locations` | user | Campus locations with their pickup points | UC-3, UC-4, UC-7 | F6 | - |
| `POST` | `/api/journeys` | driver | Go live from a preset | UC-4, UC-6 | B3 | LOCATION_PERMISSION_REQUIRED, DAILY_TRIP_LIMIT_REACHED, ILLEGAL_STATE_TRANSITION, EXTERNAL_SERVICE_UNAVAILABLE, NOT_FOUND, FORBIDDEN, EMAIL_NOT_VERIFIED |
| `GET` | `/api/journeys/mine` | driver | My journeys | UC-4 | B3 | - |
| `POST` | `/api/journeys/:id/cancel` | driver | Cancel a journey before it starts | UC-5 | B3 | ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `POST` | `/api/journeys/:id/position` | driver | Pre-start position for the geofence | UC-5 | B4 | FORBIDDEN, NOT_FOUND |
| `GET` | `/api/journeys/:id/requests` | driver | Matching requests shown as cards | UC-4, UC-8, UC-10 | B5b | FORBIDDEN, NOT_FOUND |
| `POST` | `/api/journeys/:id/start` | driver | Start the trip | UC-12 | D1 | DAILY_TRIP_LIMIT_REACHED, LOCATION_PERMISSION_REQUIRED, ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `POST` | `/api/journeys/:id/complete` | driver | Complete the trip and settle fares | UC-14, UC-21 | D1 | UNRESOLVED_BOOKINGS, ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `POST` | `/api/hop-requests` | passenger | Post a hop request; returns it with matches | UC-7, UC-8 | B5a | ACCOUNT_LOCKED, NOT_FOUND, CONFLICT, EMAIL_NOT_VERIFIED, ILLEGAL_STATE_TRANSITION |
| `GET` | `/api/hop-requests/mine` | passenger | My open requests | UC-7 | B5a | - |
| `POST` | `/api/hop-requests/:id/cancel` | passenger | Withdraw my open request | UC-7 | B5a | NOT_FOUND, FORBIDDEN, ILLEGAL_STATE_TRANSITION |
| `GET` | `/api/hop-requests/:id/matches` | passenger | Ranked matches for a request | UC-7, UC-8 | B5b | FORBIDDEN, NOT_FOUND |
| `GET` | `/api/bookings/preview` | passenger | Fare and wallet check before booking | UC-7 | C3 | NOT_FOUND, SEAT_UNAVAILABLE |
| `POST` | `/api/bookings` | passenger | Book a seat (PENDING) | UC-7 | C3 | SEAT_UNAVAILABLE, INSUFFICIENT_BALANCE, ACCOUNT_LOCKED, NOT_FOUND, EMAIL_NOT_VERIFIED, CONFLICT, ILLEGAL_STATE_TRANSITION, FORBIDDEN |
| `GET` | `/api/bookings/:id` | user | One booking (its passenger or driver only) | UC-7, UC-10 | C3 | FORBIDDEN, NOT_FOUND |
| `GET` | `/api/journeys/:id/bookings` | driver | Bookings on my journey | UC-10 | C3 | FORBIDDEN, NOT_FOUND |
| `POST` | `/api/bookings/:id/accept` | driver | Confirm the match | UC-10, UC-21 | C3 | SEAT_UNAVAILABLE, INSUFFICIENT_BALANCE, ACCOUNT_LOCKED, ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `POST` | `/api/bookings/:id/decline` | driver | Decline a request | UC-10 | C3 | ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `POST` | `/api/bookings/:id/cancel` | passenger | Cancel my booking before the trip starts | UC-11 | C3 | ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `POST` | `/api/bookings/:id/pickup-status` | driver | Picked up, dropped off or no-show | UC-13 | D1 | ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
| `GET` | `/api/wallet` | user | Balance, held amount and any debt | UC-20 | C2 | - |
| `POST` | `/api/wallet/top-up` | user | Simulated top-up | UC-20 | C2 | - |
| `POST` | `/api/wallet/withdraw` | driver | Simulated withdrawal to PayNow (FR 10.12) | UC-20 | C2 | INSUFFICIENT_BALANCE, ACCOUNT_LOCKED |
| `GET` | `/api/wallet/transactions` | user | Ledger | UC-20 | C2 | - |
| `GET` | `/api/notifications` | user | Newest first, with the unread count | UC-3 | D3 | - |
| `POST` | `/api/notifications/:id/read` | user | Mark one read | UC-3 | D3 | FORBIDDEN, NOT_FOUND |
| `POST` | `/api/notifications/read-all` | user | Mark all read | UC-3 | D3 | - |
| `GET` | `/api/notifications/preferences` | user | Push on or off | UC-3 | D3 | - |
| `PUT` | `/api/notifications/preferences` | user | Turn push on or off | UC-3 | D3 | - |
| `GET` | `/api/bookings/:id/contact` | user | The other party's first name and phone number (confirmed participants, inside the contact window) | UC-15 | D1 | FORBIDDEN, NOT_FOUND |
| `GET` | `/api/history` | user | Past journeys and bookings, newest first | UC-19 | E1 | - |
| `POST` | `/api/bookings/:id/ratings` | user | Rate the other party of a completed trip | UC-19 | E1 | ALREADY_RATED, ILLEGAL_STATE_TRANSITION, FORBIDDEN, NOT_FOUND |
