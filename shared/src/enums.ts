/**
 * Status enums, copied from the SRS v2.2 data dictionary (Appendix A). If the dictionary changes,
 * change it here: the server, the database schema (F5) and the client all read these.
 */
import { z } from 'zod';

/** Roles a user holds (FR 1.5). */
export const RoleHeld = z.enum(['DRIVER', 'PASSENGER', 'BOTH']);
/** The role a session acts in (FR 1.7, 1.8). */
export const ActiveRole = z.enum(['DRIVER', 'PASSENGER']);
export const AccountStatus = z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'LOCKED']);

export const Plan = z.enum(['SOLO', 'SHARING']);
export const PickupType = z.enum(['BUS_STOP', 'CARPARK']);
export const LocationZone = z.enum(['HALLS', 'ACADEMIC', 'GATE']);

export const JourneyStatus = z.enum(['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED']);
export const CancelReason = z.enum(['DRIVER', 'GEOFENCE', 'EXPIRED']);
export const HopRequestStatus = z.enum(['OPEN', 'MATCHED', 'EXPIRED', 'CANCELLED']);

export const BookingStatus = z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);
export const PickupStatus = z.enum(['WAITING', 'APPROACHING', 'ARRIVED', 'PICKED_UP', 'DROPPED_OFF', 'NO_SHOW', 'UNPAID']);
/**
 * The statuses a DRIVER may set by hand (UC-13). APPROACHING and ARRIVED are normally set by the system from GPS (UC-15); the driver may
 * also say "I have arrived" by hand, so a weak GPS fix can never make a no-show impossible (review finding).
 */
export const DriverPickupAction = z.enum(['ARRIVED', 'PICKED_UP', 'DROPPED_OFF', 'NO_SHOW']);
export const PaymentStatus = z.enum(['HELD', 'PAID', 'UNPAID']);

export const WalletTxType = z.enum(['TOP_UP', 'HOLD', 'RELEASE', 'DEDUCT', 'CREDIT', 'PAYOUT']);
/** Result of the wallet check before booking (FR 5.10, 10.2-10.4). */
export const BalanceCheck = z.enum(['ENOUGH', 'ON_TRUST', 'NOT_ENOUGH']);

export const NotificationType = z.enum([
  'BOOKING_REQUEST',
  'BOOKING_CONFIRMED',
  'BOOKING_DECLINED',
  'JOURNEY_CANCELLED',
  'JOURNEY_EXPIRED',
  'GEOFENCE_CANCELLED',
  'FARE_CHANGED',
  'TRIP_STARTED',
  'DRIVER_APPROACHING',
  'DRIVER_ARRIVED',
  'NO_SHOW',
  'TRIP_COMPLETED',
  'WALLET_CHECK',
  'DEBT_RECORDED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'REQUEST_ACCEPTED',
]);

export type RoleHeld = z.infer<typeof RoleHeld>;
export type ActiveRole = z.infer<typeof ActiveRole>;
export type AccountStatus = z.infer<typeof AccountStatus>;
export type Plan = z.infer<typeof Plan>;
export type PickupType = z.infer<typeof PickupType>;
export type LocationZone = z.infer<typeof LocationZone>;
export type JourneyStatus = z.infer<typeof JourneyStatus>;
export type CancelReason = z.infer<typeof CancelReason>;
export type HopRequestStatus = z.infer<typeof HopRequestStatus>;
export type BookingStatus = z.infer<typeof BookingStatus>;
export type PickupStatus = z.infer<typeof PickupStatus>;
export type DriverPickupAction = z.infer<typeof DriverPickupAction>;
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export type WalletTxType = z.infer<typeof WalletTxType>;
export type BalanceCheck = z.infer<typeof BalanceCheck>;
export type NotificationType = z.infer<typeof NotificationType>;
