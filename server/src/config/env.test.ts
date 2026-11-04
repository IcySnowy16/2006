import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, EXAMPLE_JWT_SECRET, loadConfig, parseEnv } from './env';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
const minimal = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: SECRET };

function problemsOf(env: Record<string, string | undefined>): string {
  try {
    parseEnv(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as ConfigError).message;
  }
  throw new Error('expected parseEnv to throw');
}

describe('K2: configuration', () => {
  it('accepts the two required settings and fills in every other default', () => {
    const c = parseEnv(minimal);
    expect(c).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      COOKIE_SECURE: false,
      COOKIE_SAMESITE: 'lax',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      GEOFENCE_GRACE_M: 200,
      LIVE_WINDOW_MIN: 15,
      SHARING_STOP_SECONDS: 30,
      PROXIMITY_M: 300,
    });
    expect(c.GOOGLE_MAPS_API_KEY).toBeUndefined();
  });

  it('turns numbers and booleans from text into real numbers and booleans', () => {
    const c = parseEnv({ ...minimal, PORT: '8080', COOKIE_SECURE: 'true', LIVE_WINDOW_MIN: '20' });
    expect(c.PORT).toBe(8080);
    expect(c.COOKIE_SECURE).toBe(true);
    expect(c.LIVE_WINDOW_MIN).toBe(20);
  });

  it('treats an empty value (KEY=) as not set, so the default applies', () => {
    const c = parseEnv({ ...minimal, PORT: '', GOOGLE_MAPS_API_KEY: '', LOG_LEVEL: '  ' });
    expect(c.PORT).toBe(3000);
    expect(c.GOOGLE_MAPS_API_KEY).toBeUndefined();
    expect(c.LOG_LEVEL).toBe('info');
  });

  it('a missing JWT_SECRET is reported by name', () => {
    const msg = problemsOf({ DATABASE_URL: minimal.DATABASE_URL });
    expect(msg).toContain('JWT_SECRET');
    expect(msg).toMatch(/is required/);
  });

  it('lists every problem at once, not only the first', () => {
    const msg = problemsOf({ PORT: 'abc', LIVE_WINDOW_MIN: '0', COOKIE_SAMESITE: 'weird' });
    for (const name of ['DATABASE_URL', 'JWT_SECRET', 'PORT', 'LIVE_WINDOW_MIN', 'COOKIE_SAMESITE']) expect(msg).toContain(name);
    expect(msg).toContain('5 settings are missing or invalid');
  });

  it('rejects out-of-range and non-whole numbers', () => {
    expect(problemsOf({ ...minimal, PORT: '70000' })).toContain('PORT');
    expect(problemsOf({ ...minimal, PORT: '80.5' })).toContain('whole number');
    expect(problemsOf({ ...minimal, GEOFENCE_GRACE_M: '-1' })).toContain('GEOFENCE_GRACE_M');
  });

  it('rejects a database URL that is not PostgreSQL', () => {
    expect(problemsOf({ ...minimal, DATABASE_URL: 'mysql://x' })).toContain('DATABASE_URL');
  });

  it('never prints a secret value, even a too-short one', () => {
    const msg = problemsOf({ ...minimal, JWT_SECRET: 'short-secret-xyz' });
    expect(msg).toContain('JWT_SECRET');
    expect(msg).toContain('at least 32 characters');
    expect(msg).not.toContain('short-secret-xyz');
  });

  describe('production is stricter', () => {
    it('requires Secure cookies', () => {
      expect(problemsOf({ ...minimal, NODE_ENV: 'production' })).toContain('COOKIE_SECURE: must be true in production');
      expect(parseEnv({ ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).NODE_ENV).toBe('production');
    });

    it('refuses the public sample secret', () => {
      const msg = problemsOf({ ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true', JWT_SECRET: EXAMPLE_JWT_SECRET });
      expect(msg).toContain('sample secret');
      expect(parseEnv({ ...minimal, JWT_SECRET: EXAMPLE_JWT_SECRET }).JWT_SECRET).toBe(EXAMPLE_JWT_SECRET); // fine in development
    });
  });

  describe('loadConfig (the startup entry)', () => {
    it('returns the config when the settings are good', () => {
      expect(
        loadConfig({
          env: minimal,
          exit: () => {
            throw new Error('should not exit');
          },
        }).PORT,
      ).toBe(3000);
    });

    it('a missing JWT_SECRET prints a message naming it and exits with code 1', () => {
      const written: string[] = [];
      let code: number | undefined;
      const exit = (c: number) => {
        code = c;
        return undefined as never;
      };
      loadConfig({ env: { DATABASE_URL: minimal.DATABASE_URL }, write: (t) => written.push(t), exit });
      expect(code).toBe(1);
      expect(written.join('\n')).toContain('JWT_SECRET');
      expect(written.join('\n')).toContain('.env.example');
    });
  });

  it('.env.example is a valid configuration in development and is refused as-is in production', () => {
    const text = readFileSync(path.resolve(__dirname, '../../../.env.example'), 'utf8');
    const env: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m) env[m[1]!] = m[2]!;
    }
    expect(parseEnv(env).DATABASE_URL).toMatch(/^postgresql:\/\//);
    expect(problemsOf({ ...env, NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toContain('sample secret');
    // every setting the schema knows is listed, so nobody has to guess a name
    for (const name of [
      'DATABASE_URL',
      'JWT_SECRET',
      'PORT',
      'LOG_LEVEL',
      'COOKIE_SECURE',
      'COOKIE_SAMESITE',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'EMAIL_FROM',
      'CLIENT_ORIGIN',
      'CLIENT_DIST',
      'GOOGLE_MAPS_API_KEY',
      'CAMPUS_BOUNDARY',
      'GEOFENCE_GRACE_M',
      'LIVE_WINDOW_MIN',
      'SHARING_STOP_SECONDS',
      'PROXIMITY_M',
      'NODE_ENV',
    ]) {
      expect(env, `${name} missing from .env.example`).toHaveProperty(name);
    }
  });
});
