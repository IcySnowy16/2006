/** Catalog, go live, hop requests, matching and booking: UC-4 to UC-11 (FR 2.x-5.x). */
import { z } from 'zod';
import { Cents, Id, IsoDateTime, LatLng, Position } from '../common';
import {
  BalanceCheck,
  BookingStatus,
  CancelReason,
  HopRequestStatus,
  JourneyStatus,
  LocationZone,
  PaymentStatus,
  PickupStatus,
  PickupType,
  Plan,
} from '../enums';

export const PickupPoint = z.object({ id: Id, type: PickupType, walkDistanceM: z.number().nonnegative(), accessNote: z.string().optional() });
export const CampusLocation = z.object({
  id: Id,
  name: z.string(),
  zone: LocationZone,
  isExit: z.boolean(),
  position: LatLng,
  pickupPoints: z.array(PickupPoint),
});
export const LocationList = z.array(CampusLocation);

// ---- journeys (driver) -------------------------------------------------------------------------
export const GoLiveBody = z.object({
  presetId: Id,
  position: Position,
  /** The browser said yes to location access (FR 3.9). The server refuses with LOCATION_PERMISSION_REQUIRED otherwise. */
  locationPermission: z.boolean(),
});
export const Route = z.object({ polyline: z.string(), durationSec: z.int().nonnegative(), distanceM: z.int().nonnegative() });
export const Journey = z.object({
  id: Id,
  presetId: Id.nullable(),
  status: JourneyStatus,
  cancelReason: CancelReason.nullable(),
  plan: Plan,
  seatsAvailable: z.int().min(0).max(3),
  departureTime: IsoDateTime,
  route: Route.nullable(),
});
export const GoLiveResponse = Journey;
export const JourneyList = z.array(Journey);
export const PositionBody = Position;

// ---- hop requests and matches (passenger) ------------------------------------------------------
export const HopRequestBody = z
  .object({
    fromLocationId: Id,
    toLocationId: Id,
    /** Omit for "now". Must not be in the past (FR 4.1.3) - checked on the server with its clock. */
    requestedTime: IsoDateTime.optional(),
  })
  .refine((b) => b.fromLocationId !== b.toLocationId, { message: 'Origin and destination must differ', path: ['toLocationId'] });
export const HopRequest = z.object({ id: Id, fromLocationId: Id, toLocationId: Id, requestedTime: IsoDateTime, status: HopRequestStatus });

/** One ranked result (FR 4.3, 4.4.1-4.4.4). */
export const Match = z.object({
  journeyId: Id,
  driver: z.object({ id: Id, name: z.string(), avgRating: z.number().min(0).max(5).nullable(), unpaidCount: z.int().min(0) }),
  pickupPoint: PickupPoint,
  walkDistanceM: z.number().nonnegative(),
  detourMin: z.number().min(0).max(5),
  pickupTime: IsoDateTime,
  fareCents: Cents,
});
export const MatchList = z.array(Match);

/** A request card for the driver (FR 4.8, 8.1). Never contains the passenger's email or phone (NFR-5.2). */
export const RequestCard = z.object({
  bookingId: Id.nullable(),
  hopRequestId: Id.nullable(),
  passenger: z.object({ id: Id, firstName: z.string(), avgRating: z.number().min(0).max(5).nullable(), unpaidCount: z.int().min(0) }),
  pickupPoint: PickupPoint,
  detourMin: z.number().min(0).max(5),
  fareCentsIfAccepted: Cents,
});
export const RequestCardList = z.array(RequestCard);

// ---- booking -----------------------------------------------------------------------------------
export const BookingPreviewQuery = z.object({ journeyId: Id });
export const BookingPreview = z.object({ fareCents: Cents, check: BalanceCheck, availableCents: Cents });
export const BookBody = z.object({ journeyId: Id, hopRequestId: Id.optional(), pickupPointId: Id, dropoffPointId: Id });
export const Booking = z.object({
  id: Id,
  journeyId: Id,
  status: BookingStatus,
  pickupStatus: PickupStatus,
  paymentStatus: PaymentStatus.nullable(),
  bookedOnTrust: z.boolean(),
  currentFareCents: Cents,
  finalFareCents: Cents.nullable(),
  pickupPointId: Id,
  dropoffPointId: Id,
  /** First name of the other person on the trip (the driver for a passenger, the passenger for a driver). Only filled by the read routes. */
  counterpartFirstName: z.string().nullable(),
});
export const BookingList = z.array(Booking);

export type GoLiveBody = z.infer<typeof GoLiveBody>;
export type Journey = z.infer<typeof Journey>;
export type HopRequestBody = z.infer<typeof HopRequestBody>;
export type Match = z.infer<typeof Match>;
export type BookBody = z.infer<typeof BookBody>;
export type Booking = z.infer<typeof Booking>;
export type BookingPreview = z.infer<typeof BookingPreview>;
