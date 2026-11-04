/**
 * Socket.IO events (the WebSocket channel in the architecture). Rooms are `journey:<id>` (driver and
 * CONFIRMED passengers only, NFR-5.5) and `user:<id>` (that user's notifications). K7 builds the plumbing.
 */
import { z } from 'zod';
import { Id, IsoDateTime, Position } from './common';
import { JourneyStatus, PickupStatus } from './enums';
import { Notification } from './endpoints/trip';

export const roomFor = {
  journey: (journeyId: string) => `journey:${journeyId}`,
  user: (userId: string) => `user:${userId}`,
};

/** Client -> server. */
export const ClientEvents = {
  'journey:join': z.object({ journeyId: Id }),
  'journey:leave': z.object({ journeyId: Id }),
  /** Driver only, at least every 5 s while the trip is in progress (NFR-1.4). */
  'location:update': z.object({ journeyId: Id, position: Position }),
} as const;

/** Server -> client. */
export const ServerEvents = {
  'location:update': z.object({ journeyId: Id, position: Position }),
  'pickup:status': z.object({
    journeyId: Id,
    bookingId: Id,
    status: PickupStatus,
    distanceM: z.number().nonnegative().nullable(),
    etaSec: z.int().nonnegative().nullable(),
  }),
  /** The 3-minute wait is over: the driver's No-show button can be enabled (FR 6.7). The server still checks the time itself. */
  'noshow:open': z.object({ journeyId: Id, bookingId: Id }),
  'journey:status': z.object({ journeyId: Id, status: JourneyStatus, at: IsoDateTime }),
  'notification:new': Notification,
  /** A socket action failed (e.g. a position for a journey this user does not drive). Same code and message as the HTTP error. */
  'app:error': z.object({ code: z.string(), message: z.string() }),
} as const;

export type ClientEventName = keyof typeof ClientEvents;
export type ServerEventName = keyof typeof ServerEvents;
