/**
 * Task F15: every route of the endpoint table is mounted by some route package. Nothing is left answering 501 NOT_IMPLEMENTED, and a
 * route added to shared/src/api.ts without a handler fails here. (No database is needed to mount routes.)
 */
import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from '@campus-hop/shared';
import { parseEnv } from '../config/env';
import { createContext } from '../context';
import { apiRouter } from './index';
import { mountMissing } from './mount';

describe('F15: the router covers the whole endpoint table', () => {
  const ctx = createContext({
    config: parseEnv({ DATABASE_URL: 'postgresql://x:x@localhost:5433/x', JWT_SECRET: 'a-test-secret-that-is-at-least-32-characters-long', NODE_ENV: 'test' }),
  });

  it('mounting the missing ones again finds nothing missing', () => {
    const api = apiRouter({ ctx });
    expect(mountMissing(api, ctx, ['system.health'])).toEqual([]);
  });

  it('the table has the routes the use cases need (a sanity count, so a deleted row is noticed)', () => {
    expect(Object.keys(ENDPOINTS).length).toBeGreaterThanOrEqual(45);
  });
});
