import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { api, expectError } from '../../test/helpers';
import { createLogger, requestLogger } from './logger';

/** A logger that writes into memory; each element of `lines` is one parsed JSON log line. */
function capture(level: 'debug' | 'info' = 'info') {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      for (const l of String(chunk).split('\n')) if (l.trim()) lines.push(JSON.parse(l));
      cb();
    },
  });
  return { lines, logger: createLogger({ level, destination }) };
}

describe('K2: logger', () => {
  it('writes JSON lines with a level, an ISO time and the message', () => {
    const { lines, logger } = capture();
    logger.info({ port: 3000 }, 'server listening');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ msg: 'server listening', port: 3000 });
    expect(String(lines[0]!.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lines[0]).not.toHaveProperty('pid');
  });

  it('replaces secrets with [REDACTED] and never prints them', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        password: 'hunter2',
        token: 'tok-123',
        verificationCode: '482913',
        googleMapsApiKey: 'AIza-secret',
        user: { passwordHash: '$2b$hash', email: 'a@e.ntu.edu.sg' },
        req: { headers: { authorization: 'Bearer abc.def', cookie: 'session=xyz', accept: 'json' } },
      },
      'attempt',
    );
    const text = JSON.stringify(lines[0]);
    for (const secret of ['hunter2', 'tok-123', '482913', 'AIza-secret', '$2b$hash', 'Bearer abc.def', 'session=xyz']) expect(text).not.toContain(secret);
    expect(text).toContain('[REDACTED]');
    expect(lines[0]).toMatchObject({ user: { email: 'a@e.ntu.edu.sg' }, req: { headers: { accept: 'json' } } }); // everything else is kept
  });

  it('does not redact the error code field the error handler logs', () => {
    const { lines, logger } = capture();
    logger.warn({ code: 'NOT_FOUND', requestId: 'r1' }, 'request refused');
    expect(lines[0]).toMatchObject({ code: 'NOT_FOUND', requestId: 'r1' });
  });
});

describe('K2: request logging', () => {
  function appWith(level: 'debug' | 'info' = 'info') {
    const { lines, logger } = capture(level);
    const app = createApp({
      logger,
      requestLogger: requestLogger(logger),
      health: { now: () => new Date('2026-10-13T08:00:00.000Z') },
    });
    return { app, lines };
  }

  it('logs method, path, status, duration and requestId for each request', async () => {
    const { app, lines } = appWith();
    const res = await api(app).post('/api/nope?token=secret-in-url');
    const line = lines.find((l) => l.msg === 'request completed')!;
    expect(line).toMatchObject({ method: 'POST', path: '/api/nope', status: 404 });
    expect(typeof line.durationMs).toBe('number');
    expect(line.requestId).toBe(res.headers['x-request-id']);
  });

  it('keeps the query string out of the log (it can hold tokens)', async () => {
    const { app, lines } = appWith();
    await api(app).get('/api/nope?token=secret-in-url&code=482913');
    expect(JSON.stringify(lines)).not.toContain('secret-in-url');
    expect(JSON.stringify(lines)).not.toContain('482913');
  });

  it('the id in the log line is the id in the error body the user quotes', async () => {
    const { app, lines } = appWith();
    const res = await api(app).get('/api/nope');
    const body = expectError(res, 'NOT_FOUND');
    const request = lines.find((l) => l.msg === 'request completed')!;
    const refusal = lines.find((l) => l.msg === 'request refused')!;
    expect(request.requestId).toBe(body.requestId);
    expect(refusal.requestId).toBe(body.requestId);
  });

  it('reuses a sane incoming x-request-id', async () => {
    const { app, lines } = appWith();
    const res = await api(app).get('/api/nope').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(lines.find((l) => l.msg === 'request completed')!.requestId).toBe('abc-123');
  });

  it('a request that fails to parse still gets an id and a log line', async () => {
    const { app, lines } = appWith();
    const res = await api(app).post('/api/health').set('content-type', 'application/json').send('{bad');
    const body = expectError(res, 'INVALID_JSON');
    expect(lines.find((l) => l.msg === 'request completed')).toMatchObject({ status: 400, requestId: body.requestId });
  });

  it('logs the user id when authentication has set one', async () => {
    const { lines, logger } = capture();
    const app = createApp({
      logger,
      requestLogger: (req, res, next) => {
        requestLogger(logger)(req, res, next);
        (req as unknown as { user: { id: string } }).user = { id: 'user-42' };
      },
    });
    await api(app).get('/api/nope'); // not /api/health: that one is debug level and hidden at info
    expect(lines.find((l) => l.msg === 'request completed')).toMatchObject({ userId: 'user-42' });
  });

  it('uses warn for 4xx and error for 5xx; the health route stays out of the normal log', async () => {
    const { app, lines } = appWith();
    await api(app).get('/api/nope');
    await api(app).get('/api/health');
    const done = lines.filter((l) => l.msg === 'request completed');
    expect(done).toHaveLength(1); // health is debug, hidden at info
    expect(done[0]!.level).toBe(40); // pino warn

    const quiet = appWith('debug');
    await api(quiet.app).get('/api/health');
    expect(quiet.lines.find((l) => l.msg === 'request completed')).toMatchObject({ path: '/api/health', status: 200, level: 20 });

    const { lines: bad, logger } = capture();
    const broken = createApp({
      logger,
      requestLogger: requestLogger(logger),
      health: {
        checks: {
          database: async () => {
            throw new Error('down');
          },
        },
      },
    });
    await api(broken).get('/api/health');
    expect(bad.find((l) => l.msg === 'request completed')!.level).toBe(50); // pino error
  });
});
