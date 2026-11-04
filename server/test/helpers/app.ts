/**
 * Builds a complete app for integration tests (task K4): real database, FAKE adapters, a clock the test controls and no logging.
 * `cookieFor` signs in a database user without going through the login route.
 */
import type { Express } from 'express';
import type { ActiveRole } from '@campus-hop/shared';
import { createFakeAdapters, type FakeAdapters } from '../../src/adapters';
import { createApp } from '../../src/app';
import { parseEnv } from '../../src/config/env';
import { createContext, type AppContext } from '../../src/context';
import { FakeClock } from '../../src/core/clock';
import { SESSION_COOKIE, signSession } from '../../src/auth/session';
import { TEST_DATABASE_URL } from '../db/testUrl';
import { memoryLogger } from './logger';

export interface TestApp {
  app: Express;
  ctx: AppContext;
  clock: FakeClock;
  adapters: FakeAdapters;
  /** A Cookie header that signs `user` in, acting as `activeRole` (default: the only role they hold). */
  cookieFor(user: { id: string; isDriver: boolean; isPassenger: boolean }, activeRole?: ActiveRole | null): string;
}

export const TEST_JWT_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

export function makeTestApp(env: Record<string, string> = {}): TestApp {
  const config = parseEnv({ DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: TEST_JWT_SECRET, NODE_ENV: 'test', ...env });
  const clock = new FakeClock();
  const adapters = createFakeAdapters();
  const ctx = createContext({ config, clock, adapters });
  const app = createApp({ ctx, logger: memoryLogger() });
  return {
    app,
    ctx,
    clock,
    adapters,
    cookieFor(user, activeRole) {
      const roles: ActiveRole[] = [...(user.isDriver ? (['DRIVER'] as const) : []), ...(user.isPassenger ? (['PASSENGER'] as const) : [])];
      const role = activeRole === undefined ? (roles.length === 1 ? (roles[0] ?? null) : null) : activeRole;
      return `${SESSION_COOKIE}=${signSession({ sub: user.id, roles, activeRole: role, sv: (user as { sessionVersion?: number }).sessionVersion ?? 0 }, config, clock)}`;
    },
  };
}
