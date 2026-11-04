/**
 * Tasks K12, K13, X3, X6 and the decisions list: generates the documents that must never be typed by hand.
 *
 *   docs/decisions-defaults.md   the 7 grill questions and the SRS open questions, with the default each one uses and where
 *   docs/API.md                  every route: method, path, who may call it, use cases, task, errors  (from shared/src/api.ts)
 *   docs/ERROR-CODES.md          every error code with status, message and the UC-n.EX.m it traces to (from shared/src/errors.ts)
 *   docs/traceability.csv        use case -> endpoint -> task -> source files -> tests -> screens (scanned from the code's own comments)
 *
 * `npm run docs` writes them. `npm run docs:check` writes nothing; it fails if a file is out of date, or if an active use case has no
 * endpoint or no test (missing cells are findings: they are printed, not hidden). Run it from the repository root.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DECISIONS, ENDPOINTS, ERROR_CATALOG, ERROR_CODES, errorsFor, type EndpointName } from '../shared/src';

const root = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const check = process.argv.includes('--check');

/** The use cases of model v2.3 (17). UC-9, 16, 17, 18 and 22 were retired; see SRS Appendix B. */
export const ACTIVE_USE_CASES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 19, 20, 21];

// ------------------------------------------------------------------------------------------------ file scanning
function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (['node_modules', 'dist', 'coverage', '.git'].includes(name)) continue;
    const rel = path.posix.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const isTest = (f: string) => /\.(test|paths\.test|int\.test)\.tsx?$|\/test\//.test(f);
const sourceFiles = [...walk('server/src'), ...walk('server/prisma'), ...walk('shared/src'), ...walk('client/src')].filter((f) => !isTest(f));
const testFiles = [...walk('server/src'), ...walk('server/test'), ...walk('shared/src'), ...walk('client/src')].filter(isTest);
const pageFiles = walk('client/src/pages');
const text = new Map<string, string>([...sourceFiles, ...testFiles].map((f) => [f, read(f)]));

const mentions = (file: string, uc: number) => new RegExp(`\\bUC-${uc}(?![0-9])`).test(text.get(file) ?? '');
const classOf = (file: string) => path.posix.basename(file).replace(/\.(ts|tsx)$/, '');

// ------------------------------------------------------------------------------------------------ the documents
function decisionsMd(): string {
  const rows = DECISIONS.map((d) => `| ${d.source} | ${d.question} | ${d.answer} | ${d.appliedIn} |`);
  return [
    '# Decisions that are still open, and the default each one uses',
    '',
    'Generated from `shared/src/defaults.ts` (`npm run docs`). **Nothing here has been decided by the team.** Each row is the suggested answer, applied so the code could be written; to settle a question, change the one value in `shared/src/defaults.ts` (or the setting named in the last column) and run `npm run docs`.',
    '',
    '| Source | Question | Default used | Where it is applied |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function apiMd(): string {
  const names = Object.keys(ENDPOINTS) as EndpointName[];
  const rows = names.map((n) => {
    const e = ENDPOINTS[n];
    return `| \`${e.method}\` | \`${e.path}\` | ${e.access} | ${e.summary} | ${e.useCases.join(', ') || '-'} | ${e.task} | ${
      errorsFor(n)
        .filter(
          (c) =>
            ![
              'VALIDATION_ERROR',
              'INVALID_JSON',
              'PAYLOAD_TOO_LARGE',
              'TOO_MANY_REQUESTS',
              'INTERNAL_ERROR',
              'NOT_IMPLEMENTED',
              'AUTH_REQUIRED',
              'INVALID_TOKEN',
            ].includes(c),
        )
        .join(', ') || '-'
    } |`;
  });
  return [
    '# API',
    '',
    `Generated from \`shared/src/api.ts\` (\`npm run docs\`): ${names.length} routes. The server mounts exactly these (task F15); the client calls them through typed helpers (task K9).`,
    '',
    '**Access:** `public` no login; `user` any signed-in user; `driver` / `passenger` only in that ACTIVE role. Every route can also answer `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS` and `INTERNAL_ERROR`, and every non-public route `AUTH_REQUIRED` / `INVALID_TOKEN`; those are not repeated below. Money is whole cents, times are UTC ISO strings.',
    '',
    '| Method | Path | Access | What it does | Use cases | Task | Errors (besides the common ones) |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function errorCodesMd(): string {
  const source = read('shared/src/errors.ts');
  const trace = (code: string) => new RegExp(`^\\s*${code}: \\{[^\\n]*\\}, // (.+)$`, 'm').exec(source)?.[1] ?? '';
  const rows = ERROR_CODES.map(
    (c) => `| \`${c}\` | ${ERROR_CATALOG[c].status} | ${ERROR_CATALOG[c].message} | ${trace(c) || 'framework error, no use case'} |`,
  );
  return [
    '# Error codes (SRS Appendix D)',
    '',
    `Generated from \`shared/src/errors.ts\` (\`npm run docs\`): ${ERROR_CODES.length} codes. How errors flow: a service throws \`new AppError('CODE')\`; the central error handler (\`server/src/middleware/errorHandler.ts\`) turns it into the standard JSON body \`{ code, message, details?, requestId }\` with the status below. Server-side causes (5xx) are logged and never shown to the user.`,
    '',
    '| Code | HTTP | Message the user sees | Traces to |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

interface TraceRow {
  uc: number;
  fr: string;
  classes: string;
  endpoint: string;
  screen: string;
  tests: string;
  task: string;
}

/** task id -> the traces text from docs/tasks.csv (FR / NFR references), so the FR column is prefilled from the plan. */
function taskTraces(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(path.join(root, 'docs/tasks.csv'))) return out;
  const lines = read('docs/tasks.csv').split('\n');
  for (const line of lines.slice(1)) {
    const m = /^([A-Z]\d+[a-d]?),/.exec(line);
    if (!m) continue;
    // columns are quoted CSV; the traces column is the 11th: take the FR/NFR/UC tokens out of the whole line instead of parsing quotes
    const tokens = [...line.matchAll(/\b(?:N?FR) ?\d+(?:\.\d+)*(?:[-–]\d+(?:\.\d+)*)?/g)].map((t) => t[0]);
    out.set(m[1]!, [...new Set(tokens)].slice(0, 12).join('; '));
  }
  return out;
}

function traceRows(): TraceRow[] {
  const traces = taskTraces();
  const rows: TraceRow[] = [];
  for (const uc of ACTIVE_USE_CASES) {
    const eps = (Object.keys(ENDPOINTS) as EndpointName[]).filter((n) => (ENDPOINTS[n].useCases as readonly string[]).includes(`UC-${uc}`));
    const sources = sourceFiles.filter((f) => mentions(f, uc) && /\/(services|entities|realtime|jobs|controllers)\//.test(f));
    const tests = testFiles.filter((f) => mentions(f, uc));
    const screens = pageFiles.filter((f) => mentions(f, uc));
    const base = {
      uc,
      classes: [...new Set(sources.map(classOf))].sort().join('; '),
      screen: screens.map(classOf).sort().join('; '),
      tests: tests
        .map((f) => path.posix.basename(f))
        .sort()
        .join('; '),
    };
    if (eps.length === 0) rows.push({ ...base, fr: '', endpoint: '', task: '' });
    for (const n of eps) {
      const e = ENDPOINTS[n];
      rows.push({ ...base, fr: traces.get(e.task) ?? '', endpoint: `${e.method} ${e.path}`, task: e.task });
    }
  }
  return rows;
}

const csvCell = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
function traceabilityCsv(rows: TraceRow[]): string {
  return (
    [
      'UC,FR,class,endpoint,screen,test file,task id',
      ...rows.map((r) => [`UC-${r.uc}`, r.fr, r.classes, r.endpoint, r.screen, r.tests, r.task].map(csvCell).join(',')),
    ].join('\n') + '\n'
  );
}

// ------------------------------------------------------------------------------------------------ run
const rows = traceRows();
const outputs: Record<string, string> = {
  'docs/decisions-defaults.md': decisionsMd(),
  'docs/API.md': apiMd(),
  'docs/ERROR-CODES.md': errorCodesMd(),
  'docs/traceability.csv': traceabilityCsv(rows),
};

// X6 / K13: missing cells are findings, printed in full.
const findings: string[] = [];
for (const uc of ACTIVE_USE_CASES) {
  const mine = rows.filter((r) => r.uc === uc);
  if (mine.every((r) => !r.endpoint)) findings.push(`UC-${uc}: no endpoint`);
  if (mine.every((r) => !r.tests)) findings.push(`UC-${uc}: no test mentions it`);
  if (mine.every((r) => !r.screen)) findings.push(`UC-${uc}: no screen mentions it (informational until the client pages exist)`);
}
const blocking = findings.filter((f) => !f.includes('no screen'));

if (check) {
  const stale = Object.entries(outputs).filter(([file, content]) => !existsSync(path.join(root, file)) || read(file) !== content);
  for (const [file] of stale) console.error(`out of date: ${file}   (run: npm run docs)`);
  for (const f of findings) console.error(`finding: ${f}`);
  if (stale.length || blocking.length) process.exit(1);
  console.log(`docs are up to date (${Object.keys(outputs).length} files, ${rows.length} traceability rows, ${findings.length} informational findings)`);
} else {
  for (const [file, content] of Object.entries(outputs)) writeFileSync(path.join(root, file), content, 'utf8');
  console.log(`wrote ${Object.keys(outputs).join(', ')}`);
  for (const f of findings) console.log(`finding: ${f}`);
}
