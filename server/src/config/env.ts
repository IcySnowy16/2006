import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Task K2: every setting the server reads, validated once at startup.
 * A missing or invalid value stops the process with a readable list (fail fast), never halfway through a request.
 *
 * Values that the SRS still lists as open questions (Appendix C) have a development default here and can be
 * changed with an environment variable, so settling the question later needs no code change.
 */

/** The sample secret in .env.example. It is public, so production must not accept it. */
export const EXAMPLE_JWT_SECRET = 'dev-only-secret-change-me-before-you-deploy-0123456789';

/** An empty string in .env (KEY=) means "not set", so defaults apply. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema);

const bool = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean({ error: 'must be true or false' }));
const wholeNumber = (min: number, max: number, fallback: number) =>
  opt(
    z.coerce
      .number({ error: 'must be a number' })
      .int('must be a whole number')
      .min(min, `must be at least ${min}`)
      .max(max, `must be at most ${max}`)
      .default(fallback),
  );

const EnvSchema = z
  .object({
    NODE_ENV: opt(z.enum(['development', 'test', 'production']).default('development')),
    PORT: wholeNumber(1, 65535, 3000),
    LOG_LEVEL: opt(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')),

    // Required: the server cannot do anything useful without these.
    DATABASE_URL: z.string({ error: 'is required (the PostgreSQL connection string)' }).regex(/^postgres(ql)?:\/\//, 'must start with postgresql://'),
    JWT_SECRET: z.string({ error: 'is required (a long random string that signs login cookies)' }).min(32, 'must be at least 32 characters'),

    // Login cookie. Local development runs on http, so Secure is off unless asked for.
    COOKIE_SECURE: opt(bool.default(false)),
    COOKIE_SAMESITE: opt(z.enum(['lax', 'strict', 'none']).default('lax')),

    // Where the web app is served from. CORS allows exactly this origin; with CLIENT_DIST set, the server serves the built app itself
    // (one origin, so SameSite=Lax cookies just work: the simplest way to host the demo).
    CLIENT_ORIGIN: opt(z.string().default('http://localhost:5173')),
    CLIENT_DIST: opt(z.string().optional()),

    // Mail. The defaults match the Mailpit container that K14 starts for local development.
    SMTP_HOST: opt(z.string().default('localhost')),
    SMTP_PORT: wholeNumber(1, 65535, 1025),
    SMTP_USER: opt(z.string().optional()),
    SMTP_PASS: opt(z.string().optional()),
    EMAIL_FROM: opt(z.string().default('Campus Hop <no-reply@campushop.local>')),

    // Optional: without a key the Maps adapter (K5, B2) uses its in-memory fake.
    GOOGLE_MAPS_API_KEY: opt(z.string().optional()),

    // Campus rules. Defaults follow the SRS; the open ones are marked.
    CAMPUS_BOUNDARY: opt(z.string().optional()), // path to the boundary polygon file (read by B4, SRS Q12 still open)
    GEOFENCE_GRACE_M: wholeNumber(0, 5000, 200), // SRS Q12: grace margin before auto-cancel
    LIVE_WINDOW_MIN: wholeNumber(1, 1440, 15), // SRS Q7: how long a LIVE journey waits for a booking
    SHARING_STOP_SECONDS: wholeNumber(1, 3600, 30), // NFR-5.4: location sharing stops this long after completion
    PROXIMITY_M: wholeNumber(1, 5000, 300), // "near the pickup point" distance
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.COOKIE_SECURE) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production (cookies would travel over http)' });
    if (env.JWT_SECRET === EXAMPLE_JWT_SECRET)
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'must not be the sample secret from .env.example' });
  });

export type Config = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(readonly problems: ReadonlyArray<{ name: string; message: string }>) {
    super(
      `Cannot start: ${problems.length} setting${problems.length === 1 ? ' is' : 's are'} missing or invalid.\n` +
        problems.map((p) => `  - ${p.name}: ${p.message}`).join('\n') +
        '\nCopy .env.example to .env and fill these in.',
    );
    this.name = 'ConfigError';
  }
}

/**
 * Check a set of environment variables. Pure: reads nothing global, so tests can pass their own.
 * The message names each bad setting but never its value (a short secret must not end up in a log).
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Config {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  const seen = new Set<string>();
  const problems: { name: string; message: string }[] = [];
  for (const issue of result.error.issues) {
    const name = issue.path.map(String).join('.') || 'environment';
    const key = `${name}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({ name, message: issue.message });
  }
  throw new ConfigError(problems);
}

/** Find a .env file here or in a parent folder (npm runs workspace scripts inside server/, the file sits at the repo root). */
export function findEnvFile(startDir: string = process.cwd(), levels = 3): string | undefined {
  let dir = startDir;
  for (let i = 0; i <= levels; i++) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export interface LoadOptions {
  env?: Record<string, string | undefined>;
  /** Called with the readable message when the settings are bad. Defaults to stderr. */
  write?: (text: string) => void;
  /** Called after writing. Defaults to process.exit(1). Tests replace it. */
  exit?: (code: number) => never;
  /** Read a .env file into process.env first. Defaults to on only when `env` is not supplied. */
  loadDotEnv?: boolean;
}

/**
 * The startup entry: read .env (when present), validate, and on failure print the list and stop.
 * Variables already set in the real environment win over .env, so a host's settings are never overridden.
 */
export function loadConfig(options: LoadOptions = {}): Config {
  const useDotEnv = options.loadDotEnv ?? options.env === undefined;
  if (useDotEnv) {
    const file = findEnvFile();
    if (file) process.loadEnvFile(file); // Node 22: does not overwrite variables that are already set
  }
  try {
    return parseEnv(options.env ?? process.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    (options.write ?? ((t: string) => process.stderr.write(t + '\n')))(err.message);
    return (options.exit ?? ((code: number) => process.exit(code)))(1);
  }
}
