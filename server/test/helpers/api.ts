/**
 * HTTP test helpers (task K4). `api(app)` drives the app in memory with supertest; `expectError`
 * checks the standard error shape so every test asserts errors the same way.
 */
import type { Express } from 'express';
import request, { type Response } from 'supertest';
import { expect } from 'vitest';
import { ErrorBody, type ErrorCode } from '@campus-hop/shared';
import { ERROR_CATALOG } from '../../src/errors/AppError';

export function api(app: Express) {
  return request(app);
}

/**
 * Assert that a response is the error `code`: the catalog's HTTP status, a body matching the shared
 * ErrorBody schema, and the same request id in the body and the x-request-id header.
 */
export function expectError(res: Response, code: ErrorCode): ErrorBody {
  expect(res.status, `expected ${code} (${ERROR_CATALOG[code].status}), got ${res.status}: ${JSON.stringify(res.body)}`).toBe(ERROR_CATALOG[code].status);
  const parsed = ErrorBody.safeParse(res.body);
  expect(parsed.success, `body is not the standard error shape: ${JSON.stringify(res.body)}`).toBe(true);
  const body = parsed.data as ErrorBody;
  expect(body.code).toBe(code);
  expect(body.requestId).toBeTruthy();
  expect(res.headers['x-request-id']).toBe(body.requestId);
  return body;
}
