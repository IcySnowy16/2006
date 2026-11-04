/**
 * Task K5: picks the real or the fake adapter for each outside system from the configuration. The app and its tests run
 * with no key, no mail server and no network when the fakes are chosen (NODE_ENV=test, or no Maps key).
 */
import type { Config } from '../config/env';
import type { EmailAdapter } from './EmailAdapter';
import type { MapsAdapter } from './MapsAdapter';
import type { PayNowAdapter } from './PayNowAdapter';
import type { PushAdapter } from './PushAdapter';
import { SimulatedPayNowAdapter } from './PayNowAdapter';
import { LoggingPushAdapter, type PushLogger } from './PushAdapter';
import { SmtpEmailAdapter, type EmailLogger } from './email/SmtpEmailAdapter';
import { GoogleMapsAdapter } from './maps/GoogleMapsAdapter';
import { FakeMapsAdapter, InMemoryEmailAdapter, InMemoryPayNowAdapter, InMemoryPushAdapter } from './fakes';

export interface Adapters {
  email: EmailAdapter;
  maps: MapsAdapter;
  payNow: PayNowAdapter;
  push: PushAdapter;
}

export type AdapterLogger = EmailLogger & PushLogger;

export function createAdapters(config: Config, logger: AdapterLogger): Adapters {
  if (config.NODE_ENV === 'test') return createFakeAdapters();
  return {
    email: new SmtpEmailAdapter(
      { host: config.SMTP_HOST, port: config.SMTP_PORT, user: config.SMTP_USER, pass: config.SMTP_PASS, from: config.EMAIL_FROM },
      logger,
    ),
    maps: config.GOOGLE_MAPS_API_KEY ? new GoogleMapsAdapter({ apiKey: config.GOOGLE_MAPS_API_KEY }) : new FakeMapsAdapter(),
    payNow: new SimulatedPayNowAdapter(),
    push: new LoggingPushAdapter(logger),
  };
}

/** The fakes, typed so a test can read what they recorded. */
export interface FakeAdapters {
  email: InMemoryEmailAdapter;
  maps: FakeMapsAdapter;
  payNow: InMemoryPayNowAdapter;
  push: InMemoryPushAdapter;
}

export function createFakeAdapters(): FakeAdapters {
  return { email: new InMemoryEmailAdapter(), maps: new FakeMapsAdapter(), payNow: new InMemoryPayNowAdapter(), push: new InMemoryPushAdapter() };
}

export * from './EmailAdapter';
export * from './MapsAdapter';
export * from './PayNowAdapter';
export * from './PushAdapter';
export * from './GpsSource';
export * from './fakes';
