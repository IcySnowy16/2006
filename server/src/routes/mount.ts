/**
 * Task F15: mounts one route from the endpoint table (shared/src/api.ts). The table says the method, the path, who may call it
 * and which zod schemas apply; this function turns that into the middleware chain, so a route can never be registered with a
 * different path or weaker protection than the contract says.
 *
 *   public     no login
 *   user       requireAuth (any held role)
 *   driver     requireAuth + the ACTIVE role must be DRIVER
 *   passenger  requireAuth + the ACTIVE role must be PASSENGER
 *
 * In development and tests the response is checked against its schema too, so the code and the contract cannot drift apart.
 */
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { z } from 'zod';
import { ENDPOINTS, type Endpoint, type EndpointName } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { AppError } from '../errors/AppError';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import type { SessionUser } from '../middleware/types';
import { validate } from '../middleware/validate';
import { createRateLimiters, RATE_LIMITED, type RateLimits } from '../security';

type Table = typeof ENDPOINTS;
type BodyOf<N extends EndpointName> = Table[N] extends { body: infer B extends z.ZodType } ? z.output<B> : undefined;
type QueryOf<N extends EndpointName> = Table[N] extends { query: infer Q extends z.ZodType } ? z.output<Q> : undefined;

/** The request a handler receives: the signed-in user and the parsed body and query. */
export interface EndpointRequest<N extends EndpointName> extends Omit<Request, 'body' | 'query'> {
  user: SessionUser;
  valid: { body: BodyOf<N>; query: QueryOf<N> };
}

/** The `:id` of the path (a missing or repeated one is a bad request, not a crash). */
export function idParam(req: { params: Record<string, string | string[] | undefined> }, name = 'id'): string {
  const v = req.params[name];
  if (typeof v !== 'string' || v === '') throw new AppError('VALIDATION_ERROR', { details: [{ path: name, message: 'Missing in the path' }] });
  return v;
}

/** Return this from a handler to answer 201 instead of 200. */
export class Created<T> {
  constructor(readonly data: T) {}
}
export const created = <T>(data: T): Created<T> => new Created(data);

export type Handler<N extends EndpointName> = (req: EndpointRequest<N>, res: Response, ctx: AppContext) => Promise<unknown> | unknown;

export interface MountOptions {
  /** Extra middleware (requireUnlocked, requireVerified), run after the access check and before validation. */
  extra?: RequestHandler[];
}

export interface Limiters {
  limits?: RateLimits;
}

const limiterCache = new WeakMap<AppContext, ReturnType<typeof createRateLimiters>>();

/** Which endpoint names have been mounted on each router, so the ones nobody built yet can answer 501. */
export const mountedOn = new WeakMap<Router, Set<string>>();

function limiterFor(ctx: AppContext, name: string, limits?: RateLimits): RequestHandler | undefined {
  const kind = RATE_LIMITED[name];
  if (!kind) return undefined;
  let set = limiterCache.get(ctx);
  if (!set) {
    set = createRateLimiters(limits);
    limiterCache.set(ctx, set);
  }
  return set[kind];
}

export function mount<N extends EndpointName>(
  router: Router,
  ctx: AppContext,
  name: N,
  handler: Handler<N>,
  options: MountOptions = {},
  limits?: RateLimits,
): void {
  const e = ENDPOINTS[name] as Endpoint;
  const chain: RequestHandler[] = [];
  const limiter = limiterFor(ctx, name, limits);
  if (limiter) chain.push(limiter);
  if (e.access !== 'public') chain.push(requireAuth(ctx));
  if (e.access === 'driver') chain.push(requireRole('DRIVER'));
  if (e.access === 'passenger') chain.push(requireRole('PASSENGER'));
  chain.push(...(options.extra ?? []));
  chain.push(validate({ body: e.body, query: e.query }));

  const run = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const out = await handler(req as unknown as EndpointRequest<N>, res, ctx);
      if (res.headersSent) return;
      if (e.response === null) {
        res.status(204).end();
        return;
      }
      const status = out instanceof Created ? 201 : 200;
      const data = out instanceof Created ? out.data : out;
      // Every environment sends only what the schema declares (unknown keys are stripped), so production can never leak a field
      // that tests would not have seen. Outside production a mismatch is also an error, so it is found before it ships.
      res.status(status).json(ctx.config.NODE_ENV === 'production' ? stripToSchema(e, data) : checkResponse(e, name, data));
    } catch (err) {
      next(err);
    }
  };

  const method = e.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  router[method](e.path.replace(/^\/api/, ''), ...chain, run);
  const names = mountedOn.get(router) ?? new Set<string>();
  names.add(name);
  mountedOn.set(router, names);
}

/** Every route of the table that no package mounted answers 501 NOT_IMPLEMENTED in the standard shape. */
export function mountMissing(router: Router, ctx: AppContext, alreadyHandled: readonly string[] = []): string[] {
  const done = mountedOn.get(router) ?? new Set<string>();
  const missing = (Object.keys(ENDPOINTS) as EndpointName[]).filter((n) => !done.has(n) && !alreadyHandled.includes(n));
  for (const name of missing) mount(router, ctx, name, notImplemented as Handler<typeof name>);
  return missing;
}

/** In development and tests: a response that does not match its schema is OUR bug, so it is an INTERNAL_ERROR with the details logged. */
function checkResponse(e: Endpoint, name: string, data: unknown): unknown {
  const parsed = e.response!.safeParse(data);
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', {
      cause: new Error(`Response of ${name} does not match its schema: ${JSON.stringify(parsed.error.issues).slice(0, 600)}`),
    });
  }
  return parsed.data;
}

/** In production: send the schema's view of the data (extra keys dropped). A mismatch is still our bug, but the user gets a clean 500. */
function stripToSchema(e: Endpoint, data: unknown): unknown {
  const parsed = e.response!.safeParse(data);
  if (!parsed.success) throw new AppError('INTERNAL_ERROR', { cause: new Error(`response does not match its schema: ${parsed.error.issues.length} issue(s)`) });
  return parsed.data;
}

/** A route nobody has built yet: answers 501 NOT_IMPLEMENTED in the standard shape. Used while a lane's task is unfinished. */
export const notImplemented: Handler<EndpointName> = () => {
  throw new AppError('NOT_IMPLEMENTED');
};
