/**
 * Task K5 / D3: push notifications. Off by default (feature flag pushNotifications): the app falls back to the in-app list.
 * `web-push` was NOT installed: its last release is January 2024 and it is MPL-licensed. LoggingPushAdapter only logs.
 * To switch real Web Push on later: `npm i web-push`, create VAPID keys, and add a WebPushAdapter that implements this interface.
 */
import type { Logger } from '../logging/types';

export interface PushPayload {
  title: string;
  body: string;
  /** App path to open, e.g. /trips/abc. */
  link?: string;
}

export interface PushAdapter {
  send(userId: string, payload: PushPayload): Promise<void>;
}

export type PushLogger = Pick<Logger, 'debug'>;

/** Writes a debug line instead of pushing. The user id is logged; the message text is not. */
export class LoggingPushAdapter implements PushAdapter {
  constructor(private readonly logger: PushLogger) {}

  async send(userId: string, payload: PushPayload): Promise<void> {
    this.logger.debug({ userId, title: payload.title }, 'push (simulated, not sent)');
  }
}
