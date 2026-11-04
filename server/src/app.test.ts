import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { api, expectError, memoryLogger } from '../test/helpers';

const fixedNow = () => new Date('2026-10-13T08:00:00.000Z');

describe('F3: the app', () => {
  it('GET /api/health answers 200 with status ok and the time', async () => {
    const res = await api(createApp({ health: { now: fixedNow } })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', time: '2026-10-13T08:00:00.000Z' });
  });

  it('health runs every check and passes when they all pass', async () => {
    let ran = 0;
    const app = createApp({
      health: {
        checks: {
          database: async () => {
            ran++;
          },
        },
      },
    });
    expect((await api(app).get('/api/health')).status).toBe(200);
    expect(ran).toBe(1);
  });

  it('a failing check makes health 503 EXTERNAL_SERVICE_UNAVAILABLE, and the real cause is only logged', async () => {
    const logger = memoryLogger();
    const app = createApp({
      logger,
      health: {
        checks: {
          database: async () => {
            throw new Error('connection refused at 10.0.0.5');
          },
        },
      },
    });
    const res = await api(app).get('/api/health');
    const body = expectError(res, 'EXTERNAL_SERVICE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]!.level).toBe('error');
    expect(JSON.stringify(logger.lines[0]!.obj)).toContain('connection refused');
  });

  it('an unknown route is 404 NOT_FOUND in the standard shape', async () => {
    const res = await api(createApp({ logger: memoryLogger() })).get('/api/nope');
    expectError(res, 'NOT_FOUND');
  });

  it('a route outside /api is also NOT_FOUND', async () => {
    expectError(await api(createApp({ logger: memoryLogger() })).get('/'), 'NOT_FOUND');
  });

  it('malformed JSON is 400 INVALID_JSON', async () => {
    const res = await api(createApp({ logger: memoryLogger() }))
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{bad');
    expectError(res, 'INVALID_JSON');
  });

  it('a body over the limit is 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await api(createApp({ logger: memoryLogger(), jsonLimit: '1kb' }))
      .post('/api/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(5000) }));
    expectError(res, 'PAYLOAD_TOO_LARGE');
  });

  it('echoes a sane incoming x-request-id so a user can quote it', async () => {
    const res = await api(createApp({ logger: memoryLogger() }))
      .get('/api/nope')
      .set('x-request-id', 'abc-123');
    expect(expectError(res, 'NOT_FOUND').requestId).toBe('abc-123');
  });

  it('does not advertise Express', async () => {
    const res = await api(createApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
