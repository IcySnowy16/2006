/**
 * The things every service needs, passed in instead of imported, so a test can swap any of them: the checked configuration, the
 * clock (FakeClock in tests), the adapters (fakes in tests), the event bus and the feature flags. One object per app.
 */
import type { PrismaClient } from '@prisma/client';
import { resolveFlags, type FeatureFlags } from '@campus-hop/shared';
import { createFakeAdapters, type Adapters } from './adapters';
import type { Config } from './config/env';
import { SystemClock, type Clock } from './core/clock';
import { prisma } from './core/prisma';
import { EventBus } from './events/bus';
import { silentLogger, type Logger } from './logging/types';
import type { NotificationService } from './services/NotificationService';

/** Pushes live events to connected phones. Set by the realtime gateway (K7); absent in tests that do not need it. */
export interface Realtime {
  emitToUser(userId: string, event: string, payload: unknown): void;
  emitToJourney(journeyId: string, event: string, payload: unknown): void;
  /** Take everybody out of a journey room: sharing has stopped (FR 7.10, 7.12). */
  closeJourney?(journeyId: string): void;
  /** Take one user out of a journey room (their booking ended). */
  removeFromJourney?(userId: string, journeyId: string): void;
}

export interface AppContext {
  config: Config;
  clock: Clock;
  adapters: Adapters;
  bus: EventBus;
  logger: Logger;
  flags: FeatureFlags;
  realtime?: Realtime;
  /** The one NotificationService that listens to the event bus. Set by createApp; the push-retry sweep (D4) uses it. */
  notifications?: NotificationService;
  db(): PrismaClient;
}

export function createContext(parts: { config: Config } & Partial<Omit<AppContext, 'config'>>): AppContext {
  const logger = parts.logger ?? silentLogger;
  return {
    config: parts.config,
    clock: parts.clock ?? new SystemClock(),
    adapters: parts.adapters ?? createFakeAdapters(),
    bus: parts.bus ?? new EventBus(logger),
    logger,
    flags: parts.flags ?? resolveFlags(process.env),
    realtime: parts.realtime,
    db: parts.db ?? prisma,
  };
}
