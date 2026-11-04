/**
 * Task K11: the security basics, added once.
 *  - helmet: security headers (a content security policy that allows our own scripts, https images for map tiles, and WebSockets);
 *  - CORS: only the web app's origin, with cookies (NFR-2.3);
 *  - cookie parsing for the session cookie;
 *  - rate limits on register, verify, resend and login: the 11th login in a minute is TOO_MANY_REQUESTS (NFR-2.1).
 * Password hashing is bcryptjs in AuthService (NFR-2.2), not here. `npm audit --audit-level=high` runs in CI.
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../config/env';
import { AppError } from '../errors/AppError';

export function securityMiddleware(config: Pick<Config, 'CLIENT_ORIGIN'>): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'connect-src': ["'self'", config.CLIENT_ORIGIN, 'ws:', 'wss:'],
        },
      },
    }),
    cors({ origin: config.CLIENT_ORIGIN, credentials: true }),
    cookieParser(),
  ];
}

/** Attempts allowed per minute per address. */
export interface RateLimits {
  login: number;
  register: number;
  verify: number;
  resend: number;
}

export const DEFAULT_LIMITS: RateLimits = { login: 10, register: 10, verify: 10, resend: 5 };

export type LimitedEndpoint = keyof RateLimits;

export function createRateLimiters(limits: RateLimits = DEFAULT_LIMITS, windowMs = 60_000): Record<LimitedEndpoint, RequestHandler> {
  const make = (limit: number): RequestHandler =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      // Hand the refusal to the central error handler so it has the standard shape and a request id.
      handler: (_req, _res, next) => next(new AppError('TOO_MANY_REQUESTS')),
    });
  return { login: make(limits.login), register: make(limits.register), verify: make(limits.verify), resend: make(limits.resend) };
}

/** Which endpoint names are rate limited, and under which limit. */
export const RATE_LIMITED: Record<string, LimitedEndpoint> = {
  'auth.login': 'login',
  'auth.register': 'register',
  'auth.verify': 'verify',
  'auth.resend': 'resend',
};
