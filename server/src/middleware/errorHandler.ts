import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, ERROR_CATALOG, type ErrorCode } from '../errors/AppError';
import { pickRequestId } from '../logging/requestId';
import type { Logger } from '../logging/types';

/** The shape the error handler needs from a logger. A pino logger fits it as it is (K2). */
export type ErrorLogger = Pick<Logger, 'warn' | 'error'>;

/** What the client receives. Flat, matching the Application Skeleton tab. */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface NormalizedError {
  status: number;
  body: ErrorBody;
  /** The AppError after mapping; carries `cause` for logging. */
  appError: AppError;
  /** Exactly what was thrown, which may not be an Error at all. */
  original: unknown;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;

/**
 * Turn ANYTHING that was thrown into an AppError. Libraries are recognised by shape
 * (duck-typing) so this file imports none of them and works before they are installed.
 */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isObj(err)) {
    const type = typeof err.type === 'string' ? err.type : '';
    const status = typeof err.statusCode === 'number' ? err.statusCode : typeof err.status === 'number' ? err.status : 0;

    // body-parser (Express's JSON/urlencoded parsers)
    if (type === 'entity.parse.failed') return new AppError('INVALID_JSON', { cause: err });
    if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE', { cause: err });
    if (/^(entity|encoding|charset|request|stream|parameters)\./.test(type) && status >= 400 && status < 500) {
      return new AppError('VALIDATION_ERROR', { cause: err });
    }

    // zod
    if (err.name === 'ZodError' && Array.isArray(err.issues)) {
      const details = err.issues.map((issue: unknown) => {
        const i = isObj(issue) ? issue : {};
        const path = Array.isArray(i.path) ? i.path.map(String).join('.') : '';
        return { path, message: typeof i.message === 'string' ? i.message : 'Invalid value' };
      });
      return new AppError('VALIDATION_ERROR', { details, cause: err });
    }

    // Prisma - field names only; never forward meta, SQL or model internals
    if (err.name === 'PrismaClientKnownRequestError' && typeof err.code === 'string') {
      if (err.code === 'P2002') {
        const target = isObj(err.meta) ? err.meta.target : undefined;
        const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
        return new AppError('CONFLICT', { details: fields.length ? { fields } : undefined, cause: err });
      }
      if (err.code === 'P2025') return new AppError('NOT_FOUND', { cause: err });
      if (err.code === 'P2003') return new AppError('CONFLICT', { cause: err });
    }

    // jsonwebtoken
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return new AppError('INVALID_TOKEN', { cause: err });
    }
  }

  return new AppError('INTERNAL_ERROR', { cause: err });
}

/**
 * The single place that decides what the client sees. Exported separately from the Express
 * middleware so Socket.IO handlers and background jobs (which never pass through Express)
 * produce exactly the same payload.
 */
export function normalizeError(err: unknown): NormalizedError {
  const appError = toAppError(err);
  const status = appError.statusCode;
  const serverSide = status >= 500;
  const body: ErrorBody = {
    code: appError.code,
    // 5xx: always the catalog message. The real one may contain internals.
    message: serverSide ? ERROR_CATALOG[appError.code].message : appError.message,
  };
  if (!serverSide && appError.details !== undefined) body.details = appError.details;
  return { status, body, appError, original: err };
}

// The default when no logger is given (unit tests of the shell); the server always passes the pino logger (K2).
/* eslint-disable no-console */
const consoleLogger: ErrorLogger = {
  warn: (obj, msg) => safeLog(console.warn, 'warn', obj, msg),
  error: (obj, msg) => safeLog(console.error, 'error', obj, msg),
};
/* eslint-enable no-console */

function safeLog(sink: (line: string) => void, level: string, obj: Record<string, unknown>, msg?: string): void {
  try {
    sink(JSON.stringify({ level, msg, ...obj }));
  } catch {
    sink(`${level} ${msg ?? ''} (log payload not serialisable)`);
  }
}

function describe(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack, cause: value.cause ? describe(value.cause) : undefined };
  }
  return { value: String(value) };
}

export interface ErrorHandlerOptions {
  logger?: ErrorLogger;
}

/** Mount LAST, after all routes and after notFoundHandler. */
export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
  const logger = options.logger ?? consoleLogger;

  // Express recognises error middleware by its 4-argument signature. Do not drop `_next`.
  return (err, req, res, next) => {
    // Too late to send a clean response (headers already went out): let Express close the connection.
    if (res.headersSent) {
      next(err);
      return;
    }

    // The request logger (K2) already gave this request an id; reuse it so the log line and the response match.
    const assigned: unknown = res.locals.requestId;
    const requestId = typeof assigned === 'string' ? assigned : pickRequestId(req);
    const { status, body, appError, original } = normalizeError(err);
    const userId = (req as unknown as { user?: { id?: unknown } }).user?.id;
    // Path only: a query string can carry tokens or codes, which must never reach the log.
    const context = { requestId, code: appError.code, status, method: req.method, path: req.originalUrl.split('?')[0], userId };

    if (status >= 500) {
      logger.error({ ...context, err: describe(original) }, 'request failed');
    } else {
      logger.warn({ ...context, message: appError.message }, 'request refused');
    }

    res.setHeader('x-request-id', requestId);
    res.status(status).json({ ...body, requestId });
  };
}

/** Ready-made handler with the console logger. */
export const errorHandler: ErrorRequestHandler = createErrorHandler();

/** Mount after all routes, before errorHandler: any unmatched URL becomes a NOT_FOUND AppError. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', { message: `Route ${req.method} ${req.originalUrl.split('?')[0]} not found` }));
};
