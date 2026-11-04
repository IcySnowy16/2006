import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CATALOG } from './AppError';
import { createErrorHandler, normalizeError, notFoundHandler, type ErrorLogger } from '../middleware/errorHandler';

type LogCall = { obj: Record<string, unknown>; msg?: string };

function fakeLogger() {
  const warns: LogCall[] = [];
  const errors: LogCall[] = [];
  const logger: ErrorLogger = {
    warn: (obj, msg) => void warns.push({ obj, msg }),
    error: (obj, msg) => void errors.push({ obj, msg }),
  };
  return { logger, warns, errors };
}

/** A tiny app with the same wiring order the real one will use: routes -> notFound -> errorHandler. */
function makeApp(routes: (app: Express) => void) {
  const log = fakeLogger();
  const app = express();
  app.use(express.json());
  routes(app);
  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger: log.logger }));
  return { app, ...log };
}

describe('AppError', () => {
  it('takes status and default message from the catalog', () => {
    const err = new AppError('SEAT_UNAVAILABLE');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('SEAT_UNAVAILABLE');
    expect(err.message).toBe(ERROR_CATALOG.SEAT_UNAVAILABLE.message);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('lets the caller override the message and keep the original cause', () => {
    const root = new Error('socket hang up');
    const err = new AppError('NOT_FOUND', { message: 'Journey 42 not found', cause: root });
    expect(err.message).toBe('Journey 42 not found');
    expect(err.cause).toBe(root);
  });

  it('rejects an unknown code at compile time', () => {
    const typo = () => {
      // @ts-expect-error - 'SEET_UNAVAILABLE' is not an ErrorCode; this line must stay a type error
      return new AppError('SEET_UNAVAILABLE');
    };
    expect(typeof typo).toBe('function'); // never called: at runtime the code would be unknown
  });
});

describe('errorHandler (HTTP)', () => {
  it('turns a thrown AppError into a flat JSON body', async () => {
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw new AppError('ACCOUNT_LOCKED');
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'ACCOUNT_LOCKED', message: ERROR_CATALOG.ACCOUNT_LOCKED.message });
    expect(typeof res.body.requestId).toBe('string');
  });

  it('handles a rejected promise in an async handler (Express 5 forwards it)', async () => {
    const { app } = makeApp((a) =>
      a.get('/x', async () => {
        await Promise.resolve();
        throw new AppError('INSUFFICIENT_BALANCE');
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('never leaks the message, stack or internals of an unexpected error', async () => {
    const { app, errors } = makeApp((a) =>
      a.get('/x', () => {
        throw new Error('password=hunter2 at db.internal:5432');
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe(ERROR_CATALOG.INTERNAL_ERROR.message);
    expect(res.text).not.toContain('hunter2');
    expect(res.text).not.toContain('db.internal');
    expect(res.text).not.toContain('stack');
    expect(JSON.stringify(errors[0]?.obj)).toContain('hunter2'); // the SERVER log still has it
  });

  it('hides a custom message and details on a 5xx AppError', async () => {
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { message: 'Maps key AIza... rejected', details: { key: 'secret' } });
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(502);
    expect(res.text).not.toContain('AIza');
    expect(res.text).not.toContain('secret');
  });

  it('keeps a custom message and details on a 4xx AppError', async () => {
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw new AppError('VALIDATION_ERROR', { message: 'Bad email', details: [{ path: 'email', message: 'Required' }] });
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Bad email');
    expect(res.body.details).toEqual([{ path: 'email', message: 'Required' }]);
  });

  it('maps a Prisma unique-constraint error to CONFLICT with field names only', async () => {
    const prismaLike = Object.assign(new Error('Unique constraint failed on the fields: (`ntuEmail`)'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['ntuEmail'], modelName: 'User' },
    });
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw prismaLike;
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.details).toEqual({ fields: ['ntuEmail'] });
    expect(res.text).not.toContain('modelName');
  });

  it('maps a Prisma record-not-found error to NOT_FOUND', async () => {
    const prismaLike = Object.assign(new Error('Record not found'), { name: 'PrismaClientKnownRequestError', code: 'P2025' });
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw prismaLike;
      }),
    );
    expect((await request(app).get('/x')).status).toBe(404);
  });

  it('maps a zod error to VALIDATION_ERROR with path/message details', async () => {
    const zodLike = Object.assign(new Error('invalid'), {
      name: 'ZodError',
      issues: [{ path: ['user', 'email'], message: 'Invalid email' }],
    });
    const { app } = makeApp((a) =>
      a.post('/x', () => {
        throw zodLike;
      }),
    );
    const res = await request(app).post('/x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual([{ path: 'user.email', message: 'Invalid email' }]);
  });

  it('maps JWT errors to INVALID_TOKEN', async () => {
    const jwtLike = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw jwtLike;
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects malformed JSON with INVALID_JSON, not a 500', async () => {
    const { app } = makeApp((a) => a.post('/x', (_req, res) => void res.json({ ok: true })));
    const res = await request(app).post('/x').set('Content-Type', 'application/json').send('{ not json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  it('turns an unmatched route into NOT_FOUND', async () => {
    const { app } = makeApp(() => undefined);
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('GET /nope');
  });

  it('survives a non-Error value being thrown', async () => {
    const { app } = makeApp((a) =>
      a.get('/x', () => {
        throw 'just a string';
      }),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('logs a 4xx as one warn without a stack, and a 5xx as one error with a stack', async () => {
    const four = makeApp((a) =>
      a.get('/x', () => {
        throw new AppError('FORBIDDEN');
      }),
    );
    await request(four.app).get('/x');
    expect(four.warns).toHaveLength(1);
    expect(four.errors).toHaveLength(0);
    expect(JSON.stringify(four.warns[0]?.obj)).not.toContain('stack');

    const five = makeApp((a) =>
      a.get('/x', () => {
        throw new Error('boom');
      }),
    );
    await request(five.app).get('/x');
    expect(five.errors).toHaveLength(1);
    expect(five.warns).toHaveLength(0);
    expect(JSON.stringify(five.errors[0]?.obj)).toContain('stack');
  });

  it('echoes a valid x-request-id and generates one when absent or unsafe', async () => {
    const { app } = makeApp(() => undefined);
    const echoed = await request(app).get('/nope').set('x-request-id', 'abc-123');
    expect(echoed.body.requestId).toBe('abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');

    const generated = await request(app).get('/nope');
    expect(generated.body.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const unsafe = await request(app).get('/nope').set('x-request-id', 'bad id with spaces');
    expect(unsafe.body.requestId).not.toBe('bad id with spaces');
  });
});

describe('normalizeError (the Socket.IO / background-job path)', () => {
  it('returns the same status and body shape without Express', () => {
    const { status, body } = normalizeError(new AppError('SEAT_UNAVAILABLE'));
    expect(status).toBe(409);
    expect(body).toEqual({ code: 'SEAT_UNAVAILABLE', message: ERROR_CATALOG.SEAT_UNAVAILABLE.message });
  });

  it('treats null, undefined and strings as INTERNAL_ERROR', () => {
    for (const thrown of [null, undefined, 'x', 42, {}]) {
      const { status, body } = normalizeError(thrown);
      expect(status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
    }
  });
});
