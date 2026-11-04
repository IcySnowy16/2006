/** Trip, wallet, notifications, contact, history and rating (FR 6.x-10.x). */
import { z } from 'zod';
import { Cents, Id, IsoDateTime, Position } from '../common';
import { DEFAULTS } from '../defaults';
import { DriverPickupAction, NotificationType, WalletTxType } from '../enums';

// ---- trip --------------------------------------------------------------------------------------
export const StartTripBody = z.object({ locationPermission: z.boolean(), position: Position });
export const PickupStatusBody = z.object({ status: DriverPickupAction });

// ---- wallet ------------------------------------------------------------------------------------
export const Wallet = z.object({
  balanceCents: Cents,
  heldCents: Cents,
  availableCents: Cents,
  debt: z.object({ amountCents: Cents, createdAt: IsoDateTime }).nullable(),
  /** FR 10.11: the client must label every money screen as simulated. */
  simulated: z.literal(true),
});
/** A top-up is at least the minimum and no more than the wallet limit (NFR-6.5); both read shared/src/defaults.ts. */
export const TopUpBody = z.object({ amountCents: z.int().min(DEFAULTS.TOP_UP_MIN_CENTS).max(DEFAULTS.WALLET_CAP_CENTS) });
export const WithdrawBody = z.object({ amountCents: z.int().min(100).max(100_000) });
export const WalletTransaction = z.object({ id: Id, type: WalletTxType, amountCents: Cents, bookingId: Id.nullable(), timestamp: IsoDateTime });
export const WalletTransactionList = z.array(WalletTransaction);

// ---- notifications and contact -----------------------------------------------------------------
export const Notification = z.object({
  id: Id,
  type: NotificationType,
  message: z.string(),
  timestamp: IsoDateTime,
  isRead: z.boolean(),
  link: z.string().nullable(),
});
export const NotificationList = z.object({ items: z.array(Notification), unreadCount: z.int().min(0) });
export const NotificationPreferences = z.object({ push: z.boolean() });
/**
 * UC-15 alternative flow AC.2, FR 8.6 and 8.7: the OTHER party's first name and phone number, shown only to a
 * confirmed participant of the same trip and only inside the contact window. Call-only: no message text exists.
 */
export const Contact = z.object({ firstName: z.string(), phone: z.string() });

// ---- history and rating ------------------------------------------------------------------------
export const HistoryEntry = z.object({
  kind: z.enum(['JOURNEY', 'BOOKING']),
  id: Id,
  date: IsoDateTime,
  fromName: z.string(),
  toName: z.string(),
  status: z.string(),
  pickupStatus: z.string().nullable(),
  fareCents: Cents.nullable(),
  paymentOutcome: z.string().nullable(),
  canRate: z.boolean(),
});
export const HistoryList = z.array(HistoryEntry);
export const RatingBody = z.object({ stars: z.int().min(1).max(5), comment: z.string().trim().max(200).optional() });

export type Wallet = z.infer<typeof Wallet>;
export type NotificationList = z.infer<typeof NotificationList>;
export type RatingBody = z.infer<typeof RatingBody>;
export type Contact = z.infer<typeof Contact>;
