/**
 * The error codes the API can return, their HTTP status and message, and the shape of every error
 * response. The catalog lives here (grill Q4, default A) so the server, the client and the tests read
 * ONE list: a code added to ERROR_CODES without a catalog row, or the other way round, does not compile.
 *
 * Every code traces to a use case exception (UC-n.EX.m in SRS v2.2, Appendix B.6) or a framework case.
 * System-triggered outcomes (geofence cancel, journey expiry, booking auto-cancel, no-show/UNPAID -> Debt,
 * stale location) are events handled by jobs and notifications, not refused requests, so they are
 * intentionally NOT in this catalog.
 */
import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'EMAIL_DOMAIN_NOT_ALLOWED',
  'VERIFICATION_CODE_INVALID',
  'PAYLOAD_TOO_LARGE',
  'AUTH_REQUIRED',
  'INVALID_CREDENTIALS',
  'INVALID_TOKEN',
  'FORBIDDEN',
  'ACCOUNT_LOCKED',
  'EMAIL_NOT_VERIFIED',
  'LOCATION_PERMISSION_REQUIRED',
  'DAILY_TRIP_LIMIT_REACHED',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'SEAT_UNAVAILABLE',
  'ILLEGAL_STATE_TRANSITION',
  'PRESET_IN_USE',
  'UNRESOLVED_BOOKINGS',
  'TRIP_NOT_ACTIVE',
  'ALREADY_RATED',
  'INSUFFICIENT_BALANCE',
  'CODE_ATTEMPTS_EXCEEDED',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
  'NOT_IMPLEMENTED',
  'EXTERNAL_SERVICE_UNAVAILABLE',
] as const;

export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export interface ErrorCatalogEntry {
  status: number;
  /** The default sentence the user sees. 5xx responses always use this one, never the real cause. */
  message: string;
}

/** Typed as a Record over ErrorCode: a missing or an extra key is a compile error. */
export const ERROR_CATALOG: Record<ErrorCode, ErrorCatalogEntry> = {
  // 400 - the request itself is wrong
  VALIDATION_ERROR: { status: 400, message: 'Some of the information provided is invalid.' },
  INVALID_JSON: { status: 400, message: 'The request body is not valid JSON.' },
  EMAIL_DOMAIN_NOT_ALLOWED: { status: 400, message: 'Please use your NTU email address (@e.ntu.edu.sg or @ntu.edu.sg).' }, // UC-1.EX.1
  VERIFICATION_CODE_INVALID: { status: 400, message: 'That verification code is incorrect.' }, // UC-1.EX.2
  PAYLOAD_TOO_LARGE: { status: 413, message: 'The request is too large.' },

  // 401 - who are you?
  AUTH_REQUIRED: { status: 401, message: 'Please log in to continue.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Incorrect email or password.' }, // UC-2.EX.1
  INVALID_TOKEN: { status: 401, message: 'Your session is invalid or has expired. Please log in again.' },

  // 403 - you may not do this
  FORBIDDEN: { status: 403, message: 'You do not have permission to do that.' },
  ACCOUNT_LOCKED: { status: 403, message: 'Your account is locked because of an outstanding balance. Top up your wallet to unlock it.' }, // UC-7.EX.1
  EMAIL_NOT_VERIFIED: { status: 403, message: 'Please verify your email address first.' }, // FR 1.3
  LOCATION_PERMISSION_REQUIRED: { status: 403, message: 'Location permission is required for this action.' }, // UC-4.EX.1, UC-12.EX.2
  DAILY_TRIP_LIMIT_REACHED: { status: 403, message: 'You have reached the limit of two paid trips today.' }, // UC-12.EX.1, FR 6.4

  // 404
  NOT_FOUND: { status: 404, message: 'The requested item could not be found.' },

  // 409 - valid request, but it clashes with the current state of the data
  CONFLICT: { status: 409, message: 'This conflicts with existing data.' },
  EMAIL_TAKEN: { status: 409, message: 'An account with this email already exists.' },
  SEAT_UNAVAILABLE: { status: 409, message: 'No seats are left on this journey.' }, // UC-7.EX.3, UC-10.EX.2, NFR-3.1
  ILLEGAL_STATE_TRANSITION: { status: 409, message: 'That action is not allowed in the current state.' }, // state machines A-D, UC-11.EX.1
  PRESET_IN_USE: { status: 409, message: 'This preset has a live journey. Cancel the journey first.' }, // UC-3.EX.1
  UNRESOLVED_BOOKINGS: { status: 409, message: 'Some passengers are still unresolved. Resolve them before completing the trip.' }, // UC-14.EX.1
  TRIP_NOT_ACTIVE: { status: 409, message: 'This trip is no longer active.' }, // live location after the trip ended (UC-15)
  ALREADY_RATED: { status: 409, message: 'You have already rated this booking.' }, // UC-19.EX.2

  // 422 - a business rule refuses it
  INSUFFICIENT_BALANCE: { status: 422, message: 'Your wallet balance is too low.' }, // UC-7.EX.2, UC-21.EX.1

  // 429
  CODE_ATTEMPTS_EXCEEDED: { status: 429, message: 'Too many incorrect codes. Please request a new code.' }, // UC-1.EX.2
  TOO_MANY_REQUESTS: { status: 429, message: 'Too many requests. Please try again shortly.' },

  // 5xx - our side or a dependency's. The client always gets THIS message, never the real one.
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong on our side. Please try again.' },
  NOT_IMPLEMENTED: { status: 501, message: 'This feature is not available yet.' },
  EXTERNAL_SERVICE_UNAVAILABLE: { status: 502, message: 'A service we depend on is unavailable. Please try again.' }, // UC-4.EX.2, UC-6.EX.1, e-mail and push delivery
};

/** Every failed response has exactly this body (flat, not wrapped), produced by the server's central error handler. */
export const ErrorBody = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
