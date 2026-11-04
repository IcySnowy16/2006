/**
 * Task K9: the ONE place the browser talks to the API. Pages never call `fetch`; they call `call('endpoint.name', {...})` (or the hooks
 * in ./hooks.ts) and get typed input and output taken from the shared endpoint table. A failed answer is always an ApiError with a code
 * from the shared catalog, so every screen handles errors the same way.
 */
import type { z } from 'zod';
import { ENDPOINTS, ErrorBody, type EndpointName, type ErrorCode } from '@campus-hop/shared';

type Table = typeof ENDPOINTS;
type BodyIn<N extends EndpointName> = Table[N] extends { body: infer B extends z.ZodType } ? z.input<B> : never;
type QueryIn<N extends EndpointName> = Table[N] extends { query: infer Q extends z.ZodType } ? z.input<Q> : never;
export type Out<N extends EndpointName> = Table[N]['response'] extends z.ZodType ? z.output<Table[N]['response']> : void;

export type CallInput<N extends EndpointName> = ([BodyIn<N>] extends [never] ? object : { body: BodyIn<N> }) &
  ([QueryIn<N>] extends [never] ? object : { query: QueryIn<N> }) & { params?: Record<string, string> };

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
    const v = params[key];
    if (v === undefined) throw new Error(`Missing path parameter "${key}" for ${template}`);
    return encodeURIComponent(v);
  });
}

export async function call<N extends EndpointName>(name: N, input?: CallInput<N>): Promise<Out<N>> {
  const endpoint = ENDPOINTS[name];
  const i = (input ?? {}) as { body?: unknown; query?: Record<string, string>; params?: Record<string, string> };
  let url = buildPath(endpoint.path, i.params);
  if (i.query) url += '?' + new URLSearchParams(i.query).toString();

  let res: Response;
  try {
    res = await fetch(url, {
      method: endpoint.method,
      credentials: 'include',
      headers: i.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: i.body !== undefined ? JSON.stringify(i.body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.', 0);
  }

  if (!res.ok) {
    const parsed = ErrorBody.safeParse(await res.json().catch(() => null));
    if (parsed.success) throw new ApiError(parsed.data.code, parsed.data.message, res.status, parsed.data.details, parsed.data.requestId);
    throw new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', res.status);
  }
  if (res.status === 204 || endpoint.response === null) return undefined as Out<N>;
  return (await res.json()) as Out<N>;
}

/** The sentence to show a person for any error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

export const isCode = (err: unknown, ...codes: ClientErrorCode[]): boolean => err instanceof ApiError && codes.includes(err.code);
