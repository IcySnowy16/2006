/**
 * The endpoint table: one row per HTTP route. The server mounts routes from it (F15) and validates
 * bodies with its schemas (F8 `validate`); the client builds typed calls from it (K9).
 * `access`: who may call it. 'user' = any signed-in user whatever their active role (FR 1.8);
 * 'driver' / 'passenger' = only in that ACTIVE role.
 */
import { z } from 'zod';
import type { ErrorCode } from './errors';
import * as A from './endpoints/account';
import * as H from './endpoints/hop';
import * as T from './endpoints/trip';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type Access = 'public' | 'user' | 'driver' | 'passenger';

export interface Endpoint {
  method: Method;
  path: string;
  access: Access;
  summary: string;
  body?: z.ZodType;
  query?: z.ZodType;
  /** null = 204 No Content. */
  response: z.ZodType | null;
  /** Codes this route can return besides the ones every route can (see COMMON_ERRORS). */
  errors: readonly ErrorCode[];
  useCases: readonly string[];
  /** The board task that implements it. */
  task: string;
}

/** Any route can answer with these, so they are not repeated per row. */
export const COMMON_ERRORS: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
  'NOT_IMPLEMENTED',
];
/** Added automatically to every non-public route. */
export const AUTH_ERRORS: readonly ErrorCode[] = ['AUTH_REQUIRED', 'INVALID_TOKEN'];

const Health = z.object({ status: z.literal('ok'), time: z.iso.datetime() });
const Features = z.record(z.string(), z.boolean());

const define = <T extends Record<string, Endpoint>>(t: T) => t;

export const ENDPOINTS = define({
  // ---- system ---------------------------------------------------------------------------------
  'system.features': {
    method: 'GET',
    path: '/api/features',
    access: 'public',
    summary: 'Which optional features are switched on',
    response: Features,
    errors: [],
    useCases: [],
    task: 'K15',
  },
  'system.health': {
    method: 'GET',
    path: '/api/health',
    access: 'public',
    summary: 'Liveness and database check',
    response: Health,
    errors: ['EXTERNAL_SERVICE_UNAVAILABLE'],
    useCases: [],
    task: 'F3',
  },

  // ---- account (UC-1, UC-2, UC-3) -------------------------------------------------------------
  'auth.register': {
    method: 'POST',
    path: '/api/auth/register',
    access: 'public',
    summary: 'Create an account and e-mail a code',
    body: A.RegisterBody,
    response: A.RegisterResponse,
    errors: ['EMAIL_DOMAIN_NOT_ALLOWED', 'EMAIL_TAKEN', 'EXTERNAL_SERVICE_UNAVAILABLE'],
    useCases: ['UC-1'],
    task: 'A2',
  },
  'auth.verify': {
    method: 'POST',
    path: '/api/auth/verify',
    access: 'public',
    summary: 'Submit the e-mailed code',
    body: A.VerifyBody,
    response: null,
    errors: ['VERIFICATION_CODE_INVALID', 'CODE_ATTEMPTS_EXCEEDED', 'NOT_FOUND'],
    useCases: ['UC-1'],
    task: 'A2',
  },
  'auth.resend': {
    method: 'POST',
    path: '/api/auth/resend',
    access: 'public',
    summary: 'Send a new code',
    body: A.ResendBody,
    response: null,
    errors: ['NOT_FOUND', 'EXTERNAL_SERVICE_UNAVAILABLE'],
    useCases: ['UC-1'],
    task: 'A2',
  },
  'auth.login': {
    method: 'POST',
    path: '/api/auth/login',
    access: 'public',
    summary: 'Sign in; sets the session cookie',
    body: A.LoginBody,
    response: A.Me,
    errors: ['INVALID_CREDENTIALS', 'EMAIL_NOT_VERIFIED'],
    useCases: ['UC-2'],
    task: 'A2',
  },
  'auth.logout': { method: 'POST', path: '/api/auth/logout', access: 'user', summary: 'Sign out', response: null, errors: [], useCases: ['UC-2'], task: 'A2' },
  'auth.me': {
    method: 'GET',
    path: '/api/auth/me',
    access: 'user',
    summary: 'Who is signed in, roles and active role',
    response: A.Me,
    errors: [],
    useCases: ['UC-2'],
    task: 'A2',
  },
  'me.activeRole': {
    method: 'POST',
    path: '/api/me/active-role',
    access: 'user',
    summary: 'Choose or switch the active role',
    body: A.ActiveRoleBody,
    response: A.Me,
    errors: ['FORBIDDEN', 'ILLEGAL_STATE_TRANSITION'],
    useCases: ['UC-2'],
    task: 'A6',
  },
  'me.addRole': {
    method: 'POST',
    path: '/api/me/roles',
    access: 'user',
    summary: 'Add the passenger role to a driver-only user',
    body: A.AddRoleBody,
    response: A.Me,
    errors: ['CONFLICT'],
    useCases: ['UC-3'],
    task: 'A6',
  },
  'driver.saveProfile': {
    method: 'PUT',
    path: '/api/driver/profile',
    access: 'user',
    summary: 'Save vehicle and PayNow ID; adds the driver role if missing',
    body: A.DriverProfileBody,
    response: A.DriverProfile,
    errors: [],
    useCases: ['UC-3'],
    task: 'B1',
  },
  'presets.list': {
    method: 'GET',
    path: '/api/presets',
    access: 'driver',
    summary: 'My presets',
    response: A.PresetList,
    errors: ['FORBIDDEN'],
    useCases: ['UC-3'],
    task: 'B1',
  },
  'presets.create': {
    method: 'POST',
    path: '/api/presets',
    access: 'driver',
    summary: 'New preset',
    body: A.PresetBody,
    response: A.Preset,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-3'],
    task: 'B1',
  },
  'presets.update': {
    method: 'PUT',
    path: '/api/presets/:id',
    access: 'driver',
    summary: 'Edit a preset',
    body: A.PresetBody,
    response: A.Preset,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-3'],
    task: 'B1',
  },
  'presets.delete': {
    method: 'DELETE',
    path: '/api/presets/:id',
    access: 'driver',
    summary: 'Delete a preset',
    response: null,
    errors: ['FORBIDDEN', 'NOT_FOUND', 'PRESET_IN_USE'],
    useCases: ['UC-3'],
    task: 'B1',
  },
  'catalog.locations': {
    method: 'GET',
    path: '/api/locations',
    access: 'user',
    summary: 'Campus locations with their pickup points',
    response: H.LocationList,
    errors: [],
    useCases: ['UC-3', 'UC-4', 'UC-7'],
    task: 'F6',
  },

  // ---- journeys (UC-4, UC-5, UC-12, UC-14) ----------------------------------------------------
  'journeys.goLive': {
    method: 'POST',
    path: '/api/journeys',
    access: 'driver',
    summary: 'Go live from a preset',
    body: H.GoLiveBody,
    response: H.GoLiveResponse,
    errors: [
      'LOCATION_PERMISSION_REQUIRED',
      'DAILY_TRIP_LIMIT_REACHED',
      'ILLEGAL_STATE_TRANSITION',
      'EXTERNAL_SERVICE_UNAVAILABLE',
      'NOT_FOUND',
      'FORBIDDEN',
      'EMAIL_NOT_VERIFIED',
    ],
    useCases: ['UC-4', 'UC-6'],
    task: 'B3',
  },
  'journeys.mine': {
    method: 'GET',
    path: '/api/journeys/mine',
    access: 'driver',
    summary: 'My journeys',
    response: H.JourneyList,
    errors: [],
    useCases: ['UC-4'],
    task: 'B3',
  },
  'journeys.cancel': {
    method: 'POST',
    path: '/api/journeys/:id/cancel',
    access: 'driver',
    summary: 'Cancel a journey before it starts',
    response: H.Journey,
    errors: ['ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-5'],
    task: 'B3',
  },
  'journeys.position': {
    method: 'POST',
    path: '/api/journeys/:id/position',
    access: 'driver',
    summary: 'Pre-start position for the geofence',
    body: H.PositionBody,
    response: null,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-5'],
    task: 'B4',
  },
  'journeys.requests': {
    method: 'GET',
    path: '/api/journeys/:id/requests',
    access: 'driver',
    summary: 'Matching requests shown as cards',
    response: H.RequestCardList,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-4', 'UC-8', 'UC-10'],
    task: 'B5b',
  },
  'journeys.start': {
    method: 'POST',
    path: '/api/journeys/:id/start',
    access: 'driver',
    summary: 'Start the trip',
    body: T.StartTripBody,
    response: H.Journey,
    errors: ['DAILY_TRIP_LIMIT_REACHED', 'LOCATION_PERMISSION_REQUIRED', 'ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-12'],
    task: 'D1',
  },
  'journeys.complete': {
    method: 'POST',
    path: '/api/journeys/:id/complete',
    access: 'driver',
    summary: 'Complete the trip and settle fares',
    response: H.Journey,
    errors: ['UNRESOLVED_BOOKINGS', 'ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-14', 'UC-21'],
    task: 'D1',
  },

  // ---- hop requests and booking (UC-7, UC-10, UC-11, UC-13) -----------------------------------
  'hops.create': {
    method: 'POST',
    path: '/api/hop-requests',
    access: 'passenger',
    summary: 'Post a hop request; returns it with matches',
    body: H.HopRequestBody,
    response: z.object({ hopRequest: H.HopRequest, matches: H.MatchList }),
    errors: ['ACCOUNT_LOCKED', 'NOT_FOUND', 'CONFLICT', 'EMAIL_NOT_VERIFIED', 'VALIDATION_ERROR', 'ILLEGAL_STATE_TRANSITION'],
    useCases: ['UC-7', 'UC-8'],
    task: 'B5a',
  },
  'hops.mine': {
    method: 'GET',
    path: '/api/hop-requests/mine',
    access: 'passenger',
    summary: 'My open requests',
    response: z.array(H.HopRequest),
    errors: [],
    useCases: ['UC-7'],
    task: 'B5a',
  },
  'hops.cancel': {
    method: 'POST',
    path: '/api/hop-requests/:id/cancel',
    access: 'passenger',
    summary: 'Withdraw my open request',
    response: H.HopRequest,
    errors: ['NOT_FOUND', 'FORBIDDEN', 'ILLEGAL_STATE_TRANSITION'],
    useCases: ['UC-7'],
    task: 'B5a',
  },
  'hops.matches': {
    method: 'GET',
    path: '/api/hop-requests/:id/matches',
    access: 'passenger',
    summary: 'Ranked matches for a request',
    response: H.MatchList,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-7', 'UC-8'],
    task: 'B5b',
  },
  'bookings.preview': {
    method: 'GET',
    path: '/api/bookings/preview',
    access: 'passenger',
    summary: 'Fare and wallet check before booking',
    query: H.BookingPreviewQuery,
    response: H.BookingPreview,
    errors: ['NOT_FOUND', 'SEAT_UNAVAILABLE'],
    useCases: ['UC-7'],
    task: 'C3',
  },
  'bookings.create': {
    method: 'POST',
    path: '/api/bookings',
    access: 'passenger',
    summary: 'Book a seat (PENDING)',
    body: H.BookBody,
    response: H.Booking,
    errors: [
      'SEAT_UNAVAILABLE',
      'INSUFFICIENT_BALANCE',
      'ACCOUNT_LOCKED',
      'NOT_FOUND',
      'EMAIL_NOT_VERIFIED',
      'CONFLICT',
      'ILLEGAL_STATE_TRANSITION',
      'FORBIDDEN',
    ],
    useCases: ['UC-7'],
    task: 'C3',
  },
  'bookings.get': {
    method: 'GET',
    path: '/api/bookings/:id',
    access: 'user',
    summary: 'One booking (its passenger or driver only)',
    response: H.Booking,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-7', 'UC-10'],
    task: 'C3',
  },
  'bookings.forJourney': {
    method: 'GET',
    path: '/api/journeys/:id/bookings',
    access: 'driver',
    summary: 'Bookings on my journey',
    response: H.BookingList,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-10'],
    task: 'C3',
  },
  'bookings.accept': {
    method: 'POST',
    path: '/api/bookings/:id/accept',
    access: 'driver',
    summary: 'Confirm the match',
    response: H.Booking,
    errors: ['SEAT_UNAVAILABLE', 'INSUFFICIENT_BALANCE', 'ACCOUNT_LOCKED', 'ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-10', 'UC-21'],
    task: 'C3',
  },
  'bookings.decline': {
    method: 'POST',
    path: '/api/bookings/:id/decline',
    access: 'driver',
    summary: 'Decline a request',
    response: H.Booking,
    errors: ['ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-10'],
    task: 'C3',
  },
  'bookings.cancel': {
    method: 'POST',
    path: '/api/bookings/:id/cancel',
    access: 'passenger',
    summary: 'Cancel my booking before the trip starts',
    response: H.Booking,
    errors: ['ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-11'],
    task: 'C3',
  },
  'bookings.pickupStatus': {
    method: 'POST',
    path: '/api/bookings/:id/pickup-status',
    access: 'driver',
    summary: 'Picked up, dropped off or no-show',
    body: T.PickupStatusBody,
    response: H.Booking,
    errors: ['ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-13'],
    task: 'D1',
  },

  // ---- wallet (UC-20) -------------------------------------------------------------------------
  'wallet.get': {
    method: 'GET',
    path: '/api/wallet',
    access: 'user',
    summary: 'Balance, held amount and any debt',
    response: T.Wallet,
    errors: [],
    useCases: ['UC-20'],
    task: 'C2',
  },
  'wallet.topUp': {
    method: 'POST',
    path: '/api/wallet/top-up',
    access: 'user',
    summary: 'Simulated top-up',
    body: T.TopUpBody,
    response: T.Wallet,
    errors: [],
    useCases: ['UC-20'],
    task: 'C2',
  },
  'wallet.withdraw': {
    method: 'POST',
    path: '/api/wallet/withdraw',
    access: 'driver',
    summary: 'Simulated withdrawal to PayNow (FR 10.12)',
    body: T.WithdrawBody,
    response: T.Wallet,
    errors: ['INSUFFICIENT_BALANCE', 'ACCOUNT_LOCKED', 'NOT_IMPLEMENTED'],
    useCases: ['UC-20'],
    task: 'C2',
  },
  'wallet.transactions': {
    method: 'GET',
    path: '/api/wallet/transactions',
    access: 'user',
    summary: 'Ledger',
    response: T.WalletTransactionList,
    errors: [],
    useCases: ['UC-20'],
    task: 'C2',
  },

  // ---- notifications (FR 8.12, 8.13, traced to UC-3) and contact (UC-15) ---------------------
  'notifications.list': {
    method: 'GET',
    path: '/api/notifications',
    access: 'user',
    summary: 'Newest first, with the unread count',
    response: T.NotificationList,
    errors: [],
    useCases: ['UC-3'],
    task: 'D3',
  },
  'notifications.read': {
    method: 'POST',
    path: '/api/notifications/:id/read',
    access: 'user',
    summary: 'Mark one read',
    response: null,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-3'],
    task: 'D3',
  },
  'notifications.readAll': {
    method: 'POST',
    path: '/api/notifications/read-all',
    access: 'user',
    summary: 'Mark all read',
    response: null,
    errors: [],
    useCases: ['UC-3'],
    task: 'D3',
  },
  'notifications.getPrefs': {
    method: 'GET',
    path: '/api/notifications/preferences',
    access: 'user',
    summary: 'Push on or off',
    response: T.NotificationPreferences,
    errors: [],
    useCases: ['UC-3'],
    task: 'D3',
  },
  'notifications.setPrefs': {
    method: 'PUT',
    path: '/api/notifications/preferences',
    access: 'user',
    summary: 'Turn push on or off',
    body: T.NotificationPreferences,
    response: null,
    errors: [],
    useCases: ['UC-3'],
    task: 'D3',
  },
  'bookings.contact': {
    method: 'GET',
    path: '/api/bookings/:id/contact',
    access: 'user',
    summary: "The other party's first name and phone number (confirmed participants, inside the contact window)",
    response: T.Contact,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-15'],
    task: 'D1',
  },

  // ---- history and rating (UC-19) -------------------------------------------------------------
  'history.list': {
    method: 'GET',
    path: '/api/history',
    access: 'user',
    summary: 'Past journeys and bookings, newest first',
    response: T.HistoryList,
    errors: [],
    useCases: ['UC-19'],
    task: 'E1',
  },
  'ratings.create': {
    method: 'POST',
    path: '/api/bookings/:id/ratings',
    access: 'user',
    summary: 'Rate the other party of a completed trip',
    body: T.RatingBody,
    response: null,
    errors: ['ALREADY_RATED', 'ILLEGAL_STATE_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'],
    useCases: ['UC-19'],
    task: 'E1',
  },
});

export type EndpointName = keyof typeof ENDPOINTS;

/** All codes a route can return: its own, the common ones, and the auth ones if it is not public. */
export function errorsFor(name: EndpointName): ErrorCode[] {
  const e: Endpoint = ENDPOINTS[name];
  return [...new Set([...e.errors, ...COMMON_ERRORS, ...(e.access === 'public' ? [] : AUTH_ERRORS)])];
}
