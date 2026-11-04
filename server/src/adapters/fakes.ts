/**
 * Task K5: one in-memory fake per outside system. Each records what it was asked to do (so a test can assert on it) and
 * can be told to fail (`failNext()`), so the EXTERNAL_SERVICE_UNAVAILABLE paths can be tested. No key, no mail server and no
 * network is needed to run the app or its tests with these.
 */
import { AppError } from '../errors/AppError';
import { encodePolyline } from '@campus-hop/shared';
import { haversineM, type LatLng } from '../core/geo';
import type { EmailAdapter, EmailMessage } from './EmailAdapter';
import type { DrivingRoute, MapsAdapter } from './MapsAdapter';
import type { PayNowAdapter, PayNowReceipt } from './PayNowAdapter';
import type { PushAdapter, PushPayload } from './PushAdapter';

/** The "fail next call" switch every fake shares. */
class Failable {
  private failures = 0;

  /** The next `times` calls throw EXTERNAL_SERVICE_UNAVAILABLE. */
  failNext(times = 1): void {
    this.failures = times;
  }

  protected checkFail(): void {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { cause: new Error('fake adapter told to fail') });
    }
  }
}

export class InMemoryEmailAdapter extends Failable implements EmailAdapter {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.checkFail();
    this.sent.push({ ...message });
  }

  /** The last message to this address, for tests that read the verification code. */
  lastTo(address: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === address);
  }

  /** The 6-digit code in the most recent message to `address`. */
  lastCodeFor(address: string): string | undefined {
    return /\b(\d{6})\b/.exec(this.lastTo(address)?.body ?? '')?.[1];
  }
}

export class FakeMapsAdapter extends Failable implements MapsAdapter {
  readonly routeCalls: { from: LatLng; to: LatLng; departAt: Date }[] = [];
  readonly walkCalls: { a: LatLng; b: LatLng }[] = [];

  /** A straight line with a midpoint, driven at about 30 km/h (8.3 m/s). Never calls the network. */
  async route(from: LatLng, to: LatLng, departAt: Date): Promise<DrivingRoute> {
    this.checkFail();
    this.routeCalls.push({ from, to, departAt });
    const points = [from, { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }, to];
    const distanceM = Math.round(haversineM(from, to));
    return { polyline: encodePolyline(points), points, durationSec: Math.max(1, Math.round(distanceM / 8.3)), distanceM };
  }

  async walkingDistance(a: LatLng, b: LatLng): Promise<number> {
    this.checkFail();
    this.walkCalls.push({ a, b });
    return Math.round(haversineM(a, b) * 1.2);
  }
}

export class InMemoryPayNowAdapter extends Failable implements PayNowAdapter {
  readonly topUps: { userId: string; cents: number }[] = [];
  readonly payouts: { userId: string; cents: number }[] = [];
  private n = 0;

  async simulateTopUp(userId: string, cents: number): Promise<PayNowReceipt> {
    this.checkFail();
    this.topUps.push({ userId, cents });
    return { reference: `FAKE-TOPUP-${++this.n}`, simulated: true };
  }

  async simulatePayout(userId: string, cents: number): Promise<PayNowReceipt> {
    this.checkFail();
    this.payouts.push({ userId, cents });
    return { reference: `FAKE-PAYOUT-${++this.n}`, simulated: true };
  }
}

export class InMemoryPushAdapter extends Failable implements PushAdapter {
  readonly sent: { userId: string; payload: PushPayload }[] = [];

  async send(userId: string, payload: PushPayload): Promise<void> {
    this.checkFail();
    this.sent.push({ userId, payload });
  }
}
