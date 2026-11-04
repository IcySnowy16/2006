/**
 * Task F8: permission by the ACTIVE role (FR 1.8). Holding a role is not enough: a user who holds both but is acting as a
 * passenger is refused on driver routes. Role-neutral routes (wallet, history, ratings, notifications, contact, me) use
 * requireAnyRole. Participation in a trip (tracking, pickup status, contact) is decided by being that journey's driver or that
 * booking's passenger, never by the active role (A6): a role switch cannot break a trip, because switching is blocked mid-trip.
 */
import type { RequestHandler } from 'express';
import type { ActiveRole } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';
import './types';

export function requireRole(role: ActiveRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError('AUTH_REQUIRED');
    if (req.user.activeRole !== role) {
      throw new AppError('FORBIDDEN', {
        message: req.user.roles.includes(role) ? `Switch to your ${role.toLowerCase()} role to do that.` : `This is only for ${role.toLowerCase()}s.`,
      });
    }
    next();
  };
}

export const requireAnyRole: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new AppError('AUTH_REQUIRED');
  if (req.user.roles.length === 0) throw new AppError('FORBIDDEN');
  next();
};
