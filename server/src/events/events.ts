/**
 * Task K6: the domain events. Services EMIT them after their transaction commits; NotificationService (D3) and the realtime
 * gateway (D2) LISTEN. This is the Observer pattern named in the design model. Notifications are steps inside each flow, not a
 * use case, and a failing notification never rolls back the booking or payment that caused it.
 *
 * Contact by phone (UC-15) sends no message, so there is no MessageSent event.
 */
import type { BalanceCheck, CancelReason, PickupStatus } from '@campus-hop/shared';

export interface DomainEvents {
  BookingRequested: { bookingId: string; journeyId: string; driverId: string; passengerId: string };
  BookingConfirmed: { bookingId: string; journeyId: string; driverId: string; passengerId: string };
  BookingDeclined: { bookingId: string; journeyId: string; driverId: string; passengerId: string; automatic: boolean };
  BookingCancelled: { bookingId: string; journeyId: string; driverId: string; passengerId: string; by: 'PASSENGER' | 'SYSTEM' };
  JourneyCancelled: { journeyId: string; driverId: string; reason: CancelReason; passengerIds: string[] };
  JourneyExpired: { journeyId: string; driverId: string };
  TripStarted: { journeyId: string; driverId: string; passengerIds: string[] };
  PickupStatusChanged: {
    bookingId: string;
    journeyId: string;
    passengerId: string;
    driverId: string;
    status: PickupStatus;
    distanceM: number | null;
    etaSec: number | null;
  };
  TripCompleted: { journeyId: string; driverId: string; passengerIds: string[] };
  /** 3 minutes have passed since the driver ARRIVED: the No-show button may be used (FR 6.7). */
  NoShowWindowOpened: { bookingId: string; journeyId: string; driverId: string };
  FareChanged: { bookingId: string; passengerId: string; oldCents: number; newCents: number };
  WalletChecked: { bookingId: string; passengerId: string; check: BalanceCheck };
  RequestAccepted: { hopRequestId: string; passengerId: string; journeyId: string };
  AccountLocked: { userId: string };
  AccountUnlocked: { userId: string };
  DebtRecorded: { userId: string; bookingId: string; amountCents: number };
}

export type EventName = keyof DomainEvents;
export type EventHandler<K extends EventName> = (payload: DomainEvents[K]) => void | Promise<void>;
