import type { Writable } from 'node:stream';
import type { RequestHandler } from 'express';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { pickRequestId } from './requestId';

/**
 * Task K2: one logger for the whole server.
 *
 * Rule: never log passwords, codes, tokens or the Maps key. These paths are replaced with "[REDACTED]" wherever
 * they appear, as a safety net on top of simply not logging them in the first place.
 */
export const REDACT_PATHS = [
  'password',
  'passwordHash',
  'phone',
  'token',
  'verificationCode',
  'googleMapsApiKey',
  'GOOGLE_MAPS_API_KEY',
  'JWT_SECRET',
  'SMTP_PASS',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.phone',
  '*.token',
  '*.verificationCode',
  '*.googleMapsApiKey',
  '*.GOOGLE_MAPS_API_KEY',
  '*.JWT_SECRET',
  '*.SMTP_PASS',
  '*.authorization',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export interface LoggerConfig {
  level?: LoggerOptions['level'];
  /** Where lines go. Defaults to stdout; tests pass a stream to read them back. */
  destination?: Writable;
}

export function createLogger(config: LoggerConfig = {}): Logger {
  const options: LoggerOptions = {
    level: config.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: undefined, // no pid / hostname noise in every line
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return config.destination ? pino(options, config.destination) : pino(options);
}

/** The health route is polled by the host every few seconds; keep it out of the normal log. */
const QUIET_PATHS = new Set(['/api/health']);

/**
 * Mount FIRST, before the body parser, so even a request that fails to parse gets an id and a log line.
 * It sets `res.locals.requestId` and the `x-request-id` header, and logs one line when the response finishes:
 * method, path (query string removed, it can hold tokens), status, duration and userId (set later by auth).
 * The error handler reuses the same id, so a line here and an error body the user quotes always match.
 */
export function requestLogger(logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>): RequestHandler {
  return (req, res, next) => {
    const requestId = pickRequestId(req);
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0] ?? '';
      const userId = (req as unknown as { user?: { id?: unknown } }).user?.id;
      const status = res.statusCode;
      const line = { requestId, method: req.method, path, status, durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10, userId };
      if (status >= 500) logger.error(line, 'request completed');
      else if (status >= 400) logger.warn(line, 'request completed');
      else if (QUIET_PATHS.has(path)) logger.debug(line, 'request completed');
      else logger.info(line, 'request completed');
    });
    next();
  };
}
