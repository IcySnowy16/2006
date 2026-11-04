/**
 * AppError - the one way to raise a failure anywhere in the server.
 *
 *   throw new AppError('SEAT_UNAVAILABLE');
 *   throw new AppError('NOT_FOUND', { message: `Journey ${id} not found` });
 *   throw new AppError('VALIDATION_ERROR', { details: [{ path: 'email', message: 'Required' }] });
 *   throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { cause: err });
 *
 * The central handler in middleware/errorHandler.ts turns it into the HTTP response.
 *
 * This file is deliberately framework-free (no Express or Prisma imports) so that
 * entities and services can raise errors without breaking the dependency rule from the
 * Design Model, e.g. Wallet.hold() throwing INSUFFICIENT_BALANCE.
 * The catalog (status and message per code) lives in @campus-hop/shared (grill Q4).
 */
import { ERROR_CATALOG, type ErrorCode } from '@campus-hop/shared';

export { ERROR_CATALOG, type ErrorCode };

export interface AppErrorOptions {
  /** Overrides the catalog message. Ignored for 5xx responses (the client never sees it). */
  message?: string;
  /** Machine-readable extras for the client, e.g. validation issues. Omitted for 5xx. */
  details?: unknown;
  /** The original error. Logged on the server, never sent to the client. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  /** True for errors we raised on purpose; the handler treats everything else as a bug. */
  readonly isOperational = true;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? ERROR_CATALOG[code].message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_CATALOG[code].status;
    this.details = options.details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
