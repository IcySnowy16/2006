/**
 * The login session: a signed JWT in an httpOnly cookie (task A2, F8). It carries the user id, the roles the user held at login
 * and the role the session acts in. Time comes from the Clock, so expiry is testable. The roles in the token are advisory:
 * requireAuth re-reads the user from the database, so a stale token can never grant a role the user no longer holds.
 */
import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { ActiveRole } from '@campus-hop/shared';
import { DEFAULTS } from '@campus-hop/shared';
import type { Config } from '../config/env';
import type { Clock } from '../core/clock';
import { AppError } from '../errors/AppError';

export const SESSION_COOKIE = 'campus_hop_session';

export interface SessionClaims {
  sub: string;
  roles: ActiveRole[];
  activeRole: ActiveRole | null;
  /** The user's sessionVersion when the token was issued. Signing out bumps it, which ends every older token. */
  sv: number;
}

const DAY_S = 86_400;

export function signSession(claims: SessionClaims, config: Pick<Config, 'JWT_SECRET'>, clock: Clock): string {
  const iat = Math.floor(clock.now().getTime() / 1000);
  return jwt.sign(
    { roles: claims.roles, activeRole: claims.activeRole, sv: claims.sv, sub: claims.sub, iat, exp: iat + DEFAULTS.SESSION_DAYS * DAY_S },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
    },
  );
}

/** Throws INVALID_TOKEN for anything wrong with the token: tampered, expired, wrong algorithm, wrong shape. */
export function verifySession(token: string, config: Pick<Config, 'JWT_SECRET'>, clock: Clock): SessionClaims {
  try {
    const p = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], clockTimestamp: Math.floor(clock.now().getTime() / 1000) });
    if (typeof p !== 'object' || typeof p.sub !== 'string' || !Array.isArray(p.roles) || typeof p.sv !== 'number') throw new Error('unexpected token shape');
    const roles = (p.roles as unknown[]).filter((r): r is ActiveRole => r === 'DRIVER' || r === 'PASSENGER');
    const activeRole = p.activeRole === 'DRIVER' || p.activeRole === 'PASSENGER' ? (p.activeRole as ActiveRole) : null;
    return { sub: p.sub, roles, activeRole, sv: p.sv };
  } catch (cause) {
    throw new AppError('INVALID_TOKEN', { cause });
  }
}

export function cookieOptions(config: Pick<Config, 'COOKIE_SECURE' | 'COOKIE_SAMESITE'>): CookieOptions {
  return { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAMESITE, path: '/', maxAge: DEFAULTS.SESSION_DAYS * DAY_S * 1000 };
}

export function setSessionCookie(res: Response, token: string, config: Pick<Config, 'COOKIE_SECURE' | 'COOKIE_SAMESITE'>): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(config));
}

export function clearSessionCookie(res: Response, config: Pick<Config, 'COOKIE_SECURE' | 'COOKIE_SAMESITE'>): void {
  const { maxAge: _maxAge, ...rest } = cookieOptions(config);
  res.clearCookie(SESSION_COOKIE, rest);
}

/** Read the session cookie from a raw Cookie header (the WebSocket handshake has no cookie-parser). */
export function sessionTokenFromHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
