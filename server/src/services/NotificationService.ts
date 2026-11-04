/**
 * Task D3: notifications. "Notify" is a step inside each flow, not a use case (13 Oct); this service is the one implementation
 * behind all of them, and the list, mark-as-read and push setting (FR 8.12, 8.13) are traced to UC-3 Manage Profile.
 *
 * It LISTENS to the domain events (K6). Handlers run after the transaction that caused the event has committed, and a handler that
 * fails is logged and swallowed by the bus, so a notification problem can never undo a booking or a payment.
 *
 * Delivery: the notification is stored FIRST (it is in the inbox even if everything else fails), then sent live to the user's socket
 * room, then, if the push feature is on and the user wants push, through the PushAdapter. A push that fails is retried with back-off
 * (1 s, 5 s, 30 s); the record stays. Retries live in memory, so after a restart the user simply finds the notification in the inbox.
 */
import type { NotificationType, Trip } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { addMs } from '../core/clock';
import { Money } from '../core/money';
import type { DomainEvents } from '../events/events';
import { AppError } from '../errors/AppError';
import { assertOwner } from '../middleware/ownership';

type NotificationDto = z.infer<typeof Trip.Notification>;

const BACKOFF_MS = [1_000, 5_000, 30_000];

interface PendingPush {
  userId: string;
  title: string;
  body: string;
  link: string | null;
  attempts: number;
  nextAt: Date;
}

const money = (cents: number) => Money.cents(cents).format();

export class NotificationService {
  private readonly pending: PendingPush[] = [];
  private registered = false;

  constructor(private readonly ctx: AppContext) {}

  // ---------------------------------------------------------------- subscribing to the events

  /** Subscribe to every domain event. Call once at startup (and in tests that need notifications). */
  register(): void {
    if (this.registered) return;
    this.registered = true;
    const on = this.ctx.bus.on.bind(this.ctx.bus);
    const nameOf = async (userId: string) =>
      (await this.ctx.db().user.findUnique({ where: { id: userId }, select: { name: true } }))?.name.split(/\s+/)[0] ?? 'A passenger';

    on('BookingRequested', async (e) =>
      this.notifyUser(e.driverId, 'BOOKING_REQUEST', `${await nameOf(e.passengerId)} asked to join your trip.`, `/trips/${e.journeyId}`),
    );
    on('BookingConfirmed', (e) =>
      this.notifyUser(e.passengerId, 'BOOKING_CONFIRMED', 'Your driver accepted. Your seat is confirmed.', `/bookings/${e.bookingId}`),
    );
    on('BookingDeclined', (e) =>
      this.notifyUser(
        e.passengerId,
        'BOOKING_DECLINED',
        e.automatic ? 'Your request could not be confirmed (no seat, no answer or balance too low).' : 'The driver declined your request.',
        `/bookings/${e.bookingId}`,
      ),
    );
    on('BookingCancelled', (e) =>
      this.notifyUser(e.driverId, 'BOOKING_DECLINED', 'A passenger cancelled their booking on your trip.', `/trips/${e.journeyId}`),
    );
    on('JourneyCancelled', async (e) => {
      for (const id of e.passengerIds)
        await this.notifyUser(id, 'JOURNEY_CANCELLED', 'The driver cancelled this trip. Any money on hold has been released.', `/bookings`);
      if (e.reason === 'GEOFENCE')
        await this.notifyUser(e.driverId, 'GEOFENCE_CANCELLED', 'Your journey was cancelled because you left the campus before starting.', `/trips`);
    });
    on('JourneyExpired', (e) => this.notifyUser(e.driverId, 'JOURNEY_EXPIRED', 'Your journey expired: nobody booked in time.', `/trips`));
    on('FareChanged', (e) =>
      this.notifyUser(e.passengerId, 'FARE_CHANGED', `Your fare changed from ${money(e.oldCents)} to ${money(e.newCents)}.`, `/bookings/${e.bookingId}`),
    );
    on('TripStarted', async (e) => {
      for (const id of e.passengerIds) await this.notifyUser(id, 'TRIP_STARTED', 'Your trip has started. You can follow the driver on the map.', `/bookings`);
    });
    on('PickupStatusChanged', async (e) => {
      if (e.status === 'APPROACHING')
        await this.notifyUser(e.passengerId, 'DRIVER_APPROACHING', 'Your driver is almost at your pickup point.', `/bookings/${e.bookingId}`);
      else if (e.status === 'ARRIVED') await this.notifyUser(e.passengerId, 'DRIVER_ARRIVED', 'Your driver has arrived.', `/bookings/${e.bookingId}`);
      else if (e.status === 'NO_SHOW')
        await this.notifyUser(e.passengerId, 'NO_SHOW', 'You were marked as a no-show. Your hold has been released.', `/bookings/${e.bookingId}`);
    });
    on('TripCompleted', async (e) => {
      for (const id of e.passengerIds) await this.notifyUser(id, 'TRIP_COMPLETED', 'Trip complete. You can rate your driver.', `/history`);
    });
    on('WalletChecked', (e) =>
      this.notifyUser(
        e.passengerId,
        'WALLET_CHECK',
        e.check === 'ENOUGH'
          ? 'Wallet check: enough balance for this trip.'
          : e.check === 'ON_TRUST'
            ? 'Wallet check: booked on trust. Top up before the trip ends.'
            : 'Wallet check: not enough balance. Please top up.',
        `/wallet`,
      ),
    );
    on('DebtRecorded', (e) =>
      this.notifyUser(e.userId, 'DEBT_RECORDED', `You owe ${money(e.amountCents)} from your last trip. Top up to unlock your account.`, `/wallet`),
    );
    on('AccountLocked', (e) => this.notifyUser(e.userId, 'ACCOUNT_LOCKED', 'Your account is locked until you top up what you owe.', `/wallet`));
    on('AccountUnlocked', (e) => this.notifyUser(e.userId, 'ACCOUNT_UNLOCKED', 'Your account is unlocked. You can book again.', `/wallet`));
    on('RequestAccepted', (e: DomainEvents['RequestAccepted']) =>
      this.notifyUser(e.passengerId, 'REQUEST_ACCEPTED', 'A driver going your way is live. Open your request to book.', `/requests/${e.hopRequestId}`),
    );
  }

  // ---------------------------------------------------------------- creating and delivering

  async notifyUser(userId: string, type: NotificationType, message: string, link: string | null = null): Promise<void> {
    const row = await this.ctx.db().notification.create({ data: { userId, type, message, link, timestamp: this.ctx.clock.now() } });
    const dto = toDto(row);
    this.ctx.realtime?.emitToUser(userId, 'notification:new', dto);
    await this.tryPush({ userId, title: 'Campus Hop', body: message, link, attempts: 0, nextAt: this.ctx.clock.now() });
  }

  /** The sweep (D4) calls this: push again whatever failed and is now due. Returns how many were delivered. */
  async retryDue(): Promise<number> {
    const now = this.ctx.clock.now().getTime();
    const due = this.pending.filter((p) => p.nextAt.getTime() <= now);
    for (const p of due) this.pending.splice(this.pending.indexOf(p), 1);
    let delivered = 0;
    for (const p of due) if (await this.tryPush(p)) delivered += 1;
    return delivered;
  }

  get pendingPushes(): number {
    return this.pending.length;
  }

  private async tryPush(p: PendingPush): Promise<boolean> {
    if (!this.ctx.flags.pushNotifications) return false;
    const user = await this.ctx.db().user.findUnique({ where: { id: p.userId }, select: { pushEnabled: true } });
    if (!user?.pushEnabled) return false; // FR 8.13: honoured only when the user wants it
    try {
      await this.ctx.adapters.push.send(p.userId, { title: p.title, body: p.body, ...(p.link ? { link: p.link } : {}) });
      return true;
    } catch (err) {
      const attempts = p.attempts + 1;
      this.ctx.logger.warn({ userId: p.userId, attempts, err: err instanceof Error ? err.message : String(err) }, 'push failed, will retry');
      if (attempts <= BACKOFF_MS.length) this.pending.push({ ...p, attempts, nextAt: addMs(this.ctx.clock.now(), BACKOFF_MS[attempts - 1]!) });
      return false;
    }
  }

  // ---------------------------------------------------------------- the routes (FR 8.12, 8.13)

  async list(userId: string): Promise<z.infer<typeof Trip.NotificationList>> {
    const db = this.ctx.db();
    const [rows, unreadCount] = await Promise.all([
      db.notification.findMany({ where: { userId }, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 100 }),
      db.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items: rows.map(toDto), unreadCount };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const row = await this.ctx.db().notification.findUnique({ where: { id: notificationId } });
    if (!row) throw new AppError('NOT_FOUND');
    assertOwner(row.userId, userId, 'this notification');
    await this.ctx.db().notification.update({ where: { id: notificationId }, data: { isRead: true } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.ctx.db().notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }

  async getPreferences(userId: string): Promise<{ push: boolean }> {
    const user = await this.ctx.db().user.findUniqueOrThrow({ where: { id: userId }, select: { pushEnabled: true } });
    return { push: user.pushEnabled };
  }

  async setPreferences(userId: string, push: boolean): Promise<void> {
    await this.ctx.db().user.update({ where: { id: userId }, data: { pushEnabled: push } });
  }
}

function toDto(row: { id: string; type: NotificationType; message: string; timestamp: Date; isRead: boolean; link: string | null }): NotificationDto {
  return { id: row.id, type: row.type, message: row.message, timestamp: row.timestamp.toISOString(), isRead: row.isRead, link: row.link };
}
