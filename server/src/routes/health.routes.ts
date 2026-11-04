import { Router } from 'express';
import { AppError } from '../errors/AppError';

/** A dependency the health check probes, e.g. the database (F5 adds it: `() => prisma.$queryRaw\`SELECT 1\``). */
export type HealthCheck = () => Promise<void>;

export interface HealthOptions {
  checks?: Record<string, HealthCheck>;
  /** Injected so tests can freeze time; K3 replaces this with the shared Clock. */
  now?: () => Date;
}

/** GET /api/health -> 200 { status: 'ok', time }, or 503 EXTERNAL_SERVICE_UNAVAILABLE naming the failed check. */
export function healthRouter(options: HealthOptions = {}): Router {
  const router = Router();
  const checks = options.checks ?? {};
  const now = options.now ?? (() => new Date());

  router.get('/health', async (_req, res) => {
    for (const [name, check] of Object.entries(checks)) {
      try {
        await check();
      } catch (cause) {
        throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { message: `Health check failed: ${name}`, cause });
      }
    }
    res.json({ status: 'ok', time: now().toISOString() });
  });

  return router;
}
