import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** Reuse a sane incoming x-request-id so a user can quote it; otherwise mint one. */
export function pickRequestId(req: Request): string {
  const incoming = req.header('x-request-id');
  return incoming && /^[\w.:-]{1,100}$/.test(incoming) ? incoming : randomUUID();
}
