/**
 * Task F8: a LOCKED account may not request or book (FR 10.8; SRS Q6 default: both). Use it only on those routes: a locked user
 * must still be able to log in, see the wallet, top up and cancel.
 */
import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import './types';

export const requireUnlocked: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new AppError('AUTH_REQUIRED');
  if (req.user.accountStatus === 'LOCKED') throw new AppError('ACCOUNT_LOCKED');
  next();
};

/** NFR-2.1: the NTU e-mail must be verified before going live or booking. */
export const requireVerified: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new AppError('AUTH_REQUIRED');
  if (req.user.accountStatus === 'PENDING_VERIFICATION') throw new AppError('EMAIL_NOT_VERIFIED');
  next();
};
