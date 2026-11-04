/** A logger that records instead of printing, so tests stay quiet and can assert what was logged (task K4). */
import type { ErrorLogger } from '../../src/middleware/errorHandler';

export interface LogLine {
  level: 'warn' | 'error';
  msg?: string;
  obj: Record<string, unknown>;
}

export function memoryLogger(): ErrorLogger & { lines: LogLine[] } {
  const lines: LogLine[] = [];
  return {
    lines,
    warn: (obj, msg) => {
      lines.push({ level: 'warn', msg, obj });
    },
    error: (obj, msg) => {
      lines.push({ level: 'error', msg, obj });
    },
  };
}
