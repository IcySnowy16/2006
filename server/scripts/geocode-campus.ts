/**
 * Task F6: `npm run geocode -w server`. Reads prisma/data/campus-catalog.template.json (or --in), asks the Google Geocoding API for
 * candidate coordinates and writes prisma/data/campus-catalog.geocoded.json (or --out) for a PERSON to review.
 * Needs GOOGLE_MAPS_API_KEY with the Geocoding API enabled (docs/SETUP.md, "Campus coordinates").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEnvFile } from '../src/config/env';
import { parseCatalog } from '../src/seed/catalogFile';
import { geocodeCatalog } from '../src/seed/geocode';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

async function main() {
  const envFile = findEnvFile();
  if (envFile) process.loadEnvFile(envFile);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY is not set. Put it in .env (see docs/SETUP.md, "Google Maps key"), then run this again.');
    process.exit(1);
  }
  const dataDir = path.resolve(__dirname, '../prisma/data');
  const input = path.resolve(arg('in', path.join(dataDir, 'campus-catalog.template.json')));
  const output = path.resolve(arg('out', path.join(dataDir, 'campus-catalog.geocoded.json')));

  const catalog = parseCatalog(JSON.parse(readFileSync(input, 'utf8')));
  const { catalog: result, found, missed } = await geocodeCatalog(catalog, { apiKey, log: (l) => console.log(l) });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${output}\n${found} candidate coordinates found; ${missed.length} without a usable answer.`);
  if (missed.length) console.log('Fill these in by hand:\n  - ' + missed.join('\n  - '));
  console.log('\nNEXT: open every place on a map, correct anything that is off, then set "reviewed": true on each place you checked.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
