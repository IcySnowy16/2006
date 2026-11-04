/**
 * The ONE description of a logger. A pino logger fits it as it is (K2). A part that needs less takes a slice of it, for example
 * `Pick<Logger, 'error'>`, so a test can pass `{ error: vi.fn() }` and the signature is written down only here.
 */
export interface Logger {
  debug(obj: Record<string, unknown>, msg?: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

export const silentLogger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
