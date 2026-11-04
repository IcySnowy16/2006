import { describe, expect, it } from 'vitest';
import { Account, ERROR_CODES, Hop } from '@campus-hop/shared';
import { ERROR_CATALOG } from './errors/AppError';
import { normalizeError } from './middleware/errorHandler';
import { bookBody, hopRequestBody, loginBody, presetBody, registerBody } from '../test/helpers';

describe('K1: server and shared contract agree', () => {
  it('ERROR_CATALOG and the shared ERROR_CODES list hold exactly the same codes', () => {
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual([...ERROR_CODES].sort());
  });
});

describe('F2 + K1: a real zod error from the contract becomes VALIDATION_ERROR', () => {
  it('lists the failing field, not the zod internals', () => {
    const r = Account.RegisterBody.safeParse({ ...registerBody(), password: 'short' });
    expect(r.success).toBe(false);
    const n = normalizeError(r.error);
    expect(n.status).toBe(400);
    expect(n.body.code).toBe('VALIDATION_ERROR');
    expect(n.body.details).toEqual([expect.objectContaining({ path: 'password' })]);
  });
});

describe('K4: factories produce bodies the contract accepts', () => {
  it.each([
    ['registerBody', Account.RegisterBody, registerBody],
    ['loginBody', Account.LoginBody, loginBody],
    ['presetBody', Account.PresetBody, presetBody],
    ['hopRequestBody', Hop.HopRequestBody, hopRequestBody],
    ['bookBody', Hop.BookBody, bookBody],
  ] as const)('%s is valid', (_name, schema, make) => {
    const r = schema.safeParse(make());
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('each call is unique and overrides win', () => {
    const a = registerBody();
    const b = registerBody({ role: 'DRIVER' });
    expect(a.ntuEmail).not.toBe(b.ntuEmail);
    expect(b.role).toBe('DRIVER');
  });
});
