/**
 * Task F8: reads the session cookie, verifies it, and loads the user into `req.user`.
 * No cookie: AUTH_REQUIRED. A bad, tampered or expired one: INVALID_TOKEN.
 * Roles and account status are re-read from the database, so they are always current.
 */
import type { RequestHandler } from 'express';
import type { ActiveRole } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { SESSION_COOKIE, verifySession } from '../auth/session';
import { AppError } from '../errors/AppError';
import './types';

export function requireAuth(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw new AppError('AUTH_REQUIRED');
    const claims = verifySession(token, ctx.config, ctx.clock);
    const user = await ctx.db().user.findUnique({
      where: { id: claims.sub },
      select: { id: true, isDriver: true, isPassenger: true, accountStatus: true, lastActiveRole: true, sessionVersion: true },
    });
    if (!user) throw new AppError('INVALID_TOKEN', { cause: new Error('user no longer exists') });
    if (claims.sv !== user.sessionVersion) throw new AppError('INVALID_TOKEN', { cause: new Error('signed out (session version changed)') });
    const roles: ActiveRole[] = [...(user.isDriver ? (['DRIVER'] as const) : []), ...(user.isPassenger ? (['PASSENGER'] as const) : [])];
    // The role last chosen (stored when the user switches) wins over the one in this token, so a second phone cannot keep acting as a
    // passenger after the user switched to driver on the first. A role the user no longer holds counts as "none chosen".
    const chosen = user.lastActiveRole ?? claims.activeRole;
    const activeRole = chosen && roles.includes(chosen) ? chosen : roles.length === 1 ? (roles[0] ?? null) : null;
    req.user = { id: user.id, roles, activeRole, accountStatus: user.accountStatus };
    next();
  };
}
