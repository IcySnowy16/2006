# Error codes (SRS Appendix D)

Generated from `shared/src/errors.ts` (`npm run docs`): 28 codes. How errors flow: a service throws `new AppError('CODE')`; the central error handler (`server/src/middleware/errorHandler.ts`) turns it into the standard JSON body `{ code, message, details?, requestId }` with the status below. Server-side causes (5xx) are logged and never shown to the user.

| Code | HTTP | Message the user sees | Traces to |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Some of the information provided is invalid. | framework error, no use case |
| `INVALID_JSON` | 400 | The request body is not valid JSON. | framework error, no use case |
| `EMAIL_DOMAIN_NOT_ALLOWED` | 400 | Please use your NTU email address (@e.ntu.edu.sg or @ntu.edu.sg). | UC-1.EX.1 |
| `VERIFICATION_CODE_INVALID` | 400 | That verification code is incorrect. | UC-1.EX.2 |
| `PAYLOAD_TOO_LARGE` | 413 | The request is too large. | framework error, no use case |
| `AUTH_REQUIRED` | 401 | Please log in to continue. | framework error, no use case |
| `INVALID_CREDENTIALS` | 401 | Incorrect email or password. | UC-2.EX.1 |
| `INVALID_TOKEN` | 401 | Your session is invalid or has expired. Please log in again. | framework error, no use case |
| `FORBIDDEN` | 403 | You do not have permission to do that. | framework error, no use case |
| `ACCOUNT_LOCKED` | 403 | Your account is locked because of an outstanding balance. Top up your wallet to unlock it. | UC-7.EX.1 |
| `EMAIL_NOT_VERIFIED` | 403 | Please verify your email address first. | FR 1.3 |
| `LOCATION_PERMISSION_REQUIRED` | 403 | Location permission is required for this action. | UC-4.EX.1, UC-12.EX.2 |
| `DAILY_TRIP_LIMIT_REACHED` | 403 | You have reached the limit of two paid trips today. | UC-12.EX.1, FR 6.4 |
| `NOT_FOUND` | 404 | The requested item could not be found. | framework error, no use case |
| `CONFLICT` | 409 | This conflicts with existing data. | framework error, no use case |
| `EMAIL_TAKEN` | 409 | An account with this email already exists. | framework error, no use case |
| `SEAT_UNAVAILABLE` | 409 | No seats are left on this journey. | UC-7.EX.3, UC-10.EX.2, NFR-3.1 |
| `ILLEGAL_STATE_TRANSITION` | 409 | That action is not allowed in the current state. | state machines A-D, UC-11.EX.1 |
| `PRESET_IN_USE` | 409 | This preset has a live journey. Cancel the journey first. | UC-3.EX.1 |
| `UNRESOLVED_BOOKINGS` | 409 | Some passengers are still unresolved. Resolve them before completing the trip. | UC-14.EX.1 |
| `TRIP_NOT_ACTIVE` | 409 | This trip is no longer active. | live location after the trip ended (UC-15) |
| `ALREADY_RATED` | 409 | You have already rated this booking. | UC-19.EX.2 |
| `INSUFFICIENT_BALANCE` | 422 | Your wallet balance is too low. | UC-7.EX.2, UC-21.EX.1 |
| `CODE_ATTEMPTS_EXCEEDED` | 429 | Too many incorrect codes. Please request a new code. | UC-1.EX.2 |
| `TOO_MANY_REQUESTS` | 429 | Too many requests. Please try again shortly. | framework error, no use case |
| `INTERNAL_ERROR` | 500 | Something went wrong on our side. Please try again. | framework error, no use case |
| `NOT_IMPLEMENTED` | 501 | This feature is not available yet. | framework error, no use case |
| `EXTERNAL_SERVICE_UNAVAILABLE` | 502 | A service we depend on is unavailable. Please try again. | UC-4.EX.2, UC-6.EX.1, e-mail and push delivery |
