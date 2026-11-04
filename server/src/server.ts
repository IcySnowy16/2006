import { createServer, type Server } from 'node:http';
import { createAdapters } from './adapters';
import { createApp } from './app';
import { loadConfig, type Config } from './config/env';
import { createContext } from './context';
import { disconnectPrisma } from './core/prisma';
import { startJobs } from './jobs';
import { createLogger, requestLogger } from './logging/logger';
import { attachRealtime } from './realtime/gateway';

/**
 * The process entry point (tasks F3, F15, K7, D4): read and check the settings (stop with a readable list if any is wrong), build the
 * context (config, clock, adapters, event bus), mount every route, attach the WebSocket gateway to the same HTTP server, start the
 * timers, and shut down cleanly on SIGINT / SIGTERM (stop the timers, close the sockets, then the database), and the same way, with exit code 1, after an uncaught exception or unhandled rejection.
 */
export function start(config: Config = loadConfig()): Server {
  const logger = createLogger({ level: config.LOG_LEVEL });
  const ctx = createContext({ config, adapters: createAdapters(config, logger), logger });
  const app = createApp({ ctx, logger, requestLogger: requestLogger(logger) });
  const server = createServer(app);
  const gateway = attachRealtime(server, ctx);
  const jobs = startJobs(ctx, logger, undefined, gateway.locations);

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server listening');
  });

  const shutdown = (signal: string, exitCode = 0) => {
    logger.info({ signal }, 'shutting down');
    jobs.stop();
    void gateway
      .close()
      .then(() => disconnectPrisma())
      .finally(() => process.exit(exitCode));
    // Do not hang forever on open connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  // A bug nobody caught: say so in the log, then stop cleanly with a failure code so the host restarts the container.
  process.once('uncaughtException', (err) => {
    logger.error({ err: String(err) }, 'uncaught exception');
    shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    logger.error({ err: String(reason) }, 'unhandled rejection');
    shutdown('unhandledRejection', 1);
  });
  return server;
}

if (require.main === module) {
  start();
}
