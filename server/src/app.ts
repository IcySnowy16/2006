import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import type { AppContext } from './context';
import { createErrorHandler, notFoundHandler, type ErrorLogger } from './middleware/errorHandler';
import { apiRouter, type ApiOptions } from './routes';
import { securityMiddleware } from './security';
import { NotificationService } from './services/NotificationService';

export interface AppOptions extends ApiOptions {
  /** Where the error handler logs. Defaults to JSON lines on the console; the server passes the pino logger (K2). */
  logger?: ErrorLogger;
  /** Logs one line per request and gives it an id (`requestLogger` from ./logging/logger). Off in tests, so they stay quiet. */
  requestLogger?: RequestHandler;
  /** Largest JSON body accepted; bigger requests get PAYLOAD_TOO_LARGE. */
  jsonLimit?: string;
}

/**
 * Builds the Express app WITHOUT listening, so tests can import it and drive it with supertest.
 * Mount order matters: request logger -> security (helmet, CORS, cookies) -> body parser -> routes -> client files -> 404 -> error handler
 * (the error handler must be last). The request logger is first so a request that fails to parse still gets an id and a log line.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const ctx: AppContext | undefined = options.ctx;
  app.disable('x-powered-by');
  if (ctx && !ctx.notifications) {
    // Notifications are created from the domain events, after the transaction that caused them has committed (task D3).
    ctx.notifications = new NotificationService(ctx);
    ctx.notifications.register();
  }
  if (ctx?.config.NODE_ENV === 'production') app.set('trust proxy', 1); // behind the host's proxy: the real client address, for rate limits
  if (options.requestLogger) app.use(options.requestLogger);
  if (ctx) app.use(...securityMiddleware(ctx.config));
  app.use(express.json({ limit: options.jsonLimit ?? '100kb' }));
  app.use('/api', apiRouter(options));
  if (ctx?.config.CLIENT_DIST) {
    // One origin for the demo: the server also serves the built web app, with the page itself as the answer to any other path.
    const dist = path.resolve(ctx.config.CLIENT_DIST);
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger: options.logger }));
  return app;
}
