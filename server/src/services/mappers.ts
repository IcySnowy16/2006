/**
 * Turns database rows into the shapes of the contract (shared/src/endpoints/*). One place, so a field is renamed once.
 * Nothing here adds an e-mail address, phone number or password hash: those never leave the server except through the
 * contact route (UC-15) and the account's own screens.
 */
import type { Prisma } from '@prisma/client';
import type { Hop } from '@campus-hop/shared';
import type { z } from 'zod';

type Booking = z.infer<typeof Hop.Booking>;
type Journey = z.infer<typeof Hop.Journey>;
type HopRequest = z.infer<typeof Hop.HopRequest>;
type PickupPoint = z.infer<typeof Hop.PickupPoint>;

export type JourneyWithRoute = Prisma.JourneyGetPayload<{ include: { route: true } }>;

export function toJourney(j: JourneyWithRoute): Journey {
  return {
    id: j.id,
    presetId: j.presetId,
    status: j.status,
    cancelReason: j.cancelReason,
    plan: j.plan,
    seatsAvailable: j.seatsAvailable,
    departureTime: j.departureTime.toISOString(),
    route: j.route ? { polyline: j.route.polyline, durationSec: j.route.durationSec, distanceM: j.route.distanceM } : null,
  };
}

export function toBooking(b: Prisma.BookingGetPayload<object>, counterpartFirstName: string | null = null): Booking {
  return {
    id: b.id,
    journeyId: b.journeyId,
    status: b.status,
    pickupStatus: b.pickupStatus,
    paymentStatus: b.paymentStatus,
    bookedOnTrust: b.bookedOnTrust,
    currentFareCents: b.currentFareCents,
    finalFareCents: b.finalFareCents,
    pickupPointId: b.pickupPointId,
    dropoffPointId: b.dropoffPointId,
    counterpartFirstName,
  };
}

export function toHopRequest(r: Prisma.HopRequestGetPayload<object>): HopRequest {
  return { id: r.id, fromLocationId: r.fromLocationId, toLocationId: r.toLocationId, requestedTime: r.requestedTime.toISOString(), status: r.status };
}

export function toPickupPoint(p: Prisma.PickupPointGetPayload<object>): PickupPoint {
  return { id: p.id, type: p.type, walkDistanceM: p.walkDistanceM, ...(p.accessNote ? { accessNote: p.accessNote } : {}) };
}
