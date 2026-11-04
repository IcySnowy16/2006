/** What the middleware puts on the request. */
import type { AccountStatus, ActiveRole } from '@campus-hop/shared';

export interface SessionUser {
  id: string;
  /** Roles the user holds, read from the database on every request. */
  roles: ActiveRole[];
  /** The role this session acts in; null until a user who holds both has chosen (FR 1.7). */
  activeRole: ActiveRole | null;
  accountStatus: AccountStatus;
}

/** What `validate` parsed: bodies, queries and params after the zod schemas (transforms applied). */
export interface Validated {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. The request logger reads `user.id`. */
      user?: SessionUser;
      /** Set by validate. */
      valid?: Validated;
    }
  }
}
