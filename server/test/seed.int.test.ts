/**
 * Task F6 (seed, geocode) and Q5 (demo data). The rule under test: a coordinate for the real campus is NEVER invented. Only a place a
 * person marked "reviewed", with every coordinate present, reaches the database.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '@campus-hop/shared';
import { haversineM } from '../src/core/geo';
import { prisma } from '../src/core/prisma';
import { parseCatalog, selectSeedable, walkPlaceholder } from '../src/seed/catalogFile';
import { DEMO_PASSWORD, DEMO_USERS, seedDemoScenario, seedDemoUsers, seedSyntheticCatalog } from '../src/seed/demo';
import { geocodeCatalog, geocodeOne, inSingapore } from '../src/seed/geocode';
import { seedCatalogFromFile, seedFareTiers } from '../src/seed/seedCatalog';
import { makeTestApp } from './helpers/app';

const TEMPLATE = path.resolve(__dirname, '../prisma/data/campus-catalog.template.json');
const template = () => parseCatalog(JSON.parse(readFileSync(TEMPLATE, 'utf8')));
const tmpFile = (name: string, content: unknown) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'catalog-')), name);
  writeFileSync(file, JSON.stringify(content));
  return file;
};

describe("F6: the catalog template (names from the team's campus_location_catalog.md)", () => {
  it('has the 23 halls, the academic nodes and exactly the three exit gates; every place has a pickup point', () => {
    const c = template();
    expect(c.places.filter((p) => p.zone === 'HALLS')).toHaveLength(23);
    expect(c.places.filter((p) => p.zone === 'ACADEMIC').length).toBeGreaterThanOrEqual(7);
    expect(
      c.places
        .filter((p) => p.isExit)
        .map((p) => p.name)
        .sort(),
    ).toEqual([...DEFAULTS.EXIT_GATES].sort());
    expect(c.places.every((p) => p.pickupPoints.length >= 1)).toBe(true);
  });

  it('contains NO coordinates and nothing reviewed, so nothing in it can be seeded as it stands', () => {
    const c = template();
    expect(c.places.every((p) => p.lat === null && p.lng === null && !p.reviewed && p.pickupPoints.every((q) => q.lat === null && q.lng === null))).toBe(true);
    const { ready, skipped } = selectSeedable(c);
    expect(ready).toEqual([]);
    expect(skipped).toHaveLength(c.places.length);
  });

  it('flags the pickup points the catalog document does not name with a TODO', () => {
    const todos = template().places.flatMap((p) => p.pickupPoints.filter((q) => q.note?.startsWith('TODO')).map((q) => `${p.name}/${q.name}`));
    expect(todos.length).toBeGreaterThan(0);
  });
});

describe('F6: what may be seeded (selectSeedable)', () => {
  const base = { version: 1 as const, places: [] as unknown[] };
  const place = (o: Record<string, unknown>) => ({
    name: 'Hall X',
    zone: 'HALLS',
    reviewed: true,
    lat: 1.35,
    lng: 103.68,
    pickupPoints: [{ name: 'Hall X stop', type: 'BUS_STOP', lat: 1.3501, lng: 103.6801 }],
    ...o,
  });

  it('a reviewed place with every coordinate is ready; the walking distance defaults to straight line x 1.3', () => {
    const { ready } = selectSeedable(parseCatalog({ ...base, places: [place({})] }));
    expect(ready).toHaveLength(1);
    const expected = Math.round(haversineM({ lat: 1.35, lng: 103.68 }, { lat: 1.3501, lng: 103.6801 }) * 1.3);
    expect(ready[0]!.pickups[0]!.walkDistanceM).toBe(expected);
    expect(walkPlaceholder({ lat: 1.35, lng: 103.68 }, { lat: 1.3501, lng: 103.6801 })).toBe(expected);
  });

  it('a walking distance that was given is kept', () => {
    const p = place({ pickupPoints: [{ name: 's', type: 'CARPARK', lat: 1.3501, lng: 103.6801, walkDistanceM: 77 }] });
    expect(selectSeedable(parseCatalog({ ...base, places: [p] })).ready[0]!.pickups[0]!.walkDistanceM).toBe(77);
  });

  it.each([
    ['not reviewed', { reviewed: false }, 'not reviewed'],
    ['no place coordinates', { lat: null }, 'no coordinates'],
    ['a pickup point without coordinates', { pickupPoints: [{ name: 'Hall X stop', type: 'BUS_STOP', lat: null, lng: null }] }, 'has no coordinates'],
  ])('skipped: %s', (_name, change, reason) => {
    const { ready, skipped } = selectSeedable(parseCatalog({ ...base, places: [place(change)] }));
    expect(ready).toEqual([]);
    expect(skipped[0]!.reason).toContain(reason);
  });

  it('a malformed file is rejected, not half-read', () => {
    expect(() => parseCatalog({ version: 2, places: [] })).toThrow();
    expect(() => parseCatalog({ version: 1, places: [{ name: 'x', zone: 'MOON', pickupPoints: [] }] })).toThrow();
  });
});

describe('F6: seeding the database', () => {
  it('the fare table: 1 rider 300, 2 and 3 riders 200; running it again changes nothing', async () => {
    await seedFareTiers(prisma());
    await seedFareTiers(prisma());
    const rows = await prisma().fareTier.findMany({ orderBy: { riders: 'asc' } });
    expect(rows.map((r) => [r.riders, r.perRiderCents])).toEqual([
      [1, 300],
      [2, 200],
      [3, 200],
    ]);
  });

  it('only reviewed places are written; the pickup points carry their names; a second run adds nothing', async () => {
    const good = {
      name: 'Hall 9',
      zone: 'HALLS',
      reviewed: true,
      lat: 1.352114,
      lng: 103.684894,
      pickupPoints: [
        { name: 'Hall 8 & 9', type: 'BUS_STOP', lat: 1.3522, lng: 103.6849 },
        { name: 'Hall 9 carpark', type: 'CARPARK', note: 'open carpark', lat: 1.3519, lng: 103.6851 },
      ],
    };
    const unreviewed = { ...good, name: 'Hall 11', reviewed: false };
    const file = tmpFile('reviewed.json', { version: 1, places: [good, unreviewed] });

    const first = await seedCatalogFromFile(prisma(), file);
    expect(first.seeded).toEqual([{ place: 'Hall 9', pickupPoints: 2 }]);
    expect(first.skipped).toEqual([{ name: 'Hall 11', reason: 'not reviewed' }]);
    await seedCatalogFromFile(prisma(), file);

    expect(await prisma().campusLocation.count()).toBe(1);
    const stops = await prisma().pickupPoint.findMany({ orderBy: { accessNote: 'asc' } });
    expect(stops.map((s) => s.accessNote)).toEqual(['Hall 8 & 9', 'Hall 9 carpark: open carpark']);
    expect(stops.every((s) => s.walkDistanceM > 0)).toBe(true);

    // and the API lists it, with the exits flagged
    const t = makeTestApp();
    const user = await prisma().user.create({ data: { name: 'X', ntuEmail: 'x@e.ntu.edu.sg', phone: '81234567', passwordHash: 'x', accountStatus: 'ACTIVE' } });
    const res = await request(t.app)
      .get('/api/locations')
      .set('Cookie', t.cookieFor({ id: user.id, isDriver: false, isPassenger: true }));
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Hall 9', zone: 'HALLS', isExit: false });
    expect(res.body[0].pickupPoints).toHaveLength(2);
  });

  it('seeding the real template with nothing reviewed writes no place at all', async () => {
    const result = await seedCatalogFromFile(prisma(), TEMPLATE);
    expect(result.seeded).toEqual([]);
    expect(await prisma().campusLocation.count()).toBe(0);
  });
});

describe('F6: the geocode script (Google Geocoding API, mocked here)', () => {
  const ok = (lat: number, lng: number, address = 'Somewhere, Singapore') =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'OK', results: [{ formatted_address: address, geometry: { location: { lat, lng } } }] }),
    }) as Response;
  const fetchFn = (impl: (url: URL) => Response) => (async (u: URL | string) => impl(new URL(String(u)))) as unknown as typeof fetch;
  const tiny = () =>
    parseCatalog({
      version: 1,
      places: [
        {
          name: 'Hall 1',
          zone: 'HALLS',
          pickupPoints: [
            { name: 'Hall 1', type: 'BUS_STOP' },
            { name: 'Hall 1 carpark', type: 'CARPARK', lat: 1.1, lng: 103.9 },
          ],
        },
      ],
    });

  it('fills what is missing as a CANDIDATE: never reviewed, never overwriting, with the address as the source', async () => {
    const result = await geocodeCatalog(tiny(), {
      apiKey: 'K',
      fetchFn: fetchFn(() => ok(1.3, 103.68, 'Hall 1, 21 Nanyang Cres, Singapore')),
      sleep: async () => undefined,
      today: '2026-10-19',
    });
    const place = result.catalog.places[0]!;
    expect(place).toMatchObject({ lat: 1.3, lng: 103.68, reviewed: false, source: 'google-geocoding 2026-10-19: Hall 1, 21 Nanyang Cres, Singapore' });
    expect(place.pickupPoints[0]).toMatchObject({ lat: 1.3, lng: 103.68 });
    expect(place.pickupPoints[1]).toMatchObject({ lat: 1.1, lng: 103.9 }); // already there: left alone
    expect(result.found).toBe(2);
  });

  it('an answer outside Singapore is dropped and reported, not pinned', async () => {
    expect(inSingapore(1.35, 103.68)).toBe(true);
    expect(inSingapore(51.5, -0.12)).toBe(false);
    const result = await geocodeCatalog(tiny(), { apiKey: 'K', fetchFn: fetchFn(() => ok(51.5, -0.12)), sleep: async () => undefined });
    expect(result.catalog.places[0]!.lat).toBeNull();
    expect(result.missed).toEqual(['Hall 1', 'Hall 1 / Hall 1']);
  });

  it('ZERO_RESULTS is a miss; any other status is an error that does not contain the key', async () => {
    const zero = fetchFn(() => ({ ok: true, status: 200, json: async () => ({ status: 'ZERO_RESULTS' }) }) as Response);
    expect(await geocodeOne('nowhere', { apiKey: 'SECRET-KEY', fetchFn: zero })).toBeNull();
    const denied = fetchFn(() => ({ ok: true, status: 200, json: async () => ({ status: 'REQUEST_DENIED' }) }) as Response);
    await expect(geocodeOne('x', { apiKey: 'SECRET-KEY', fetchFn: denied })).rejects.toThrow('REQUEST_DENIED');
    await expect(geocodeOne('x', { apiKey: 'SECRET-KEY', fetchFn: denied })).rejects.not.toThrow(/SECRET-KEY/);
  });

  it('the key is sent to Google but never ends up in the output', async () => {
    const seen: string[] = [];
    const result = await geocodeCatalog(tiny(), {
      apiKey: 'SECRET-KEY',
      fetchFn: fetchFn((u) => (seen.push(u.searchParams.get('key') ?? ''), ok(1.3, 103.68))),
      sleep: async () => undefined,
    });
    expect(seen.every((k) => k === 'SECRET-KEY')).toBe(true);
    expect(JSON.stringify(result.catalog)).not.toContain('SECRET-KEY');
  });
});

describe('Q5: demo data', () => {
  it('demo users can log in with the demo password and have the wallets and history the rehearsal needs', async () => {
    await seedDemoUsers(prisma());
    await seedDemoUsers(prisma()); // again: no duplicates
    expect(await prisma().user.count()).toBe(DEMO_USERS.length);
    const t = makeTestApp();
    const res = await request(t.app).post('/api/auth/login').send({ ntuEmail: 'demo.rider1@e.ntu.edu.sg', password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.wallet.balanceCents).toBe(2000);
    const driver = await request(t.app).post('/api/auth/login').send({ ntuEmail: 'demo.driver@e.ntu.edu.sg', password: DEMO_PASSWORD });
    expect(driver.body.hasDriverProfile).toBe(true);
    // Sam is under $3 (the low-balance warning) but over $2 (can still ask); Wei is under $2 (cannot ask)
    const sam = await prisma().user.findUniqueOrThrow({ where: { ntuEmail: 'demo.rider3@e.ntu.edu.sg' }, include: { wallet: true } });
    expect(sam.wallet!.balanceCents).toBe(250);
    const wei = await prisma().user.findUniqueOrThrow({ where: { ntuEmail: 'demo.rider2@e.ntu.edu.sg' }, include: { wallet: true } });
    expect(wei.wallet!.balanceCents).toBe(100);
  });

  it('the full scenario: Dana has two presets, Lee is LOCKED with a real $0.70 debt that a $0.70 top-up clears; running it twice changes nothing', async () => {
    await seedSyntheticCatalog(prisma());
    await seedDemoUsers(prisma());
    const first = await seedDemoScenario(prisma());
    expect(first).toEqual(['Dana has 2 presets', 'Lee is LOCKED with a $0.70 debt']);
    expect(await seedDemoScenario(prisma())).toEqual([]);
    expect(await prisma().driverPreset.count()).toBe(2);

    const t = makeTestApp();
    const login = await request(t.app).post('/api/auth/login').send({ ntuEmail: 'demo.locked@e.ntu.edu.sg', password: DEMO_PASSWORD });
    expect(login.body.accountStatus).toBe('LOCKED');
    const agent = request.agent(t.app);
    await agent.post('/api/auth/login').send({ ntuEmail: 'demo.locked@e.ntu.edu.sg', password: DEMO_PASSWORD });
    expect((await agent.get('/api/wallet')).body.debt.amountCents).toBe(70);
    await agent.post('/api/wallet/top-up').send({ amountCents: 100 }).expect(200);
    expect((await agent.get('/api/auth/me')).body.accountStatus).toBe('ACTIVE');
  });

  it('without a catalog the scenario skips presets and the locked account instead of inventing places', async () => {
    await seedDemoUsers(prisma());
    expect((await seedDemoScenario(prisma()))[0]).toContain('No exit gate');
    expect(await prisma().driverPreset.count()).toBe(0);
  });

  it('the synthetic catalog is clearly marked and is only ever written on request', async () => {
    expect(await prisma().campusLocation.count()).toBe(0);
    expect(await seedSyntheticCatalog(prisma())).toBe(5);
    await seedSyntheticCatalog(prisma());
    const places = await prisma().campusLocation.findMany();
    expect(places).toHaveLength(5);
    expect(places.every((p) => p.name.startsWith('[DEMO]'))).toBe(true);
    expect(places.filter((p) => p.isExit)).toHaveLength(2);
  });

  it('the [DEMO] grid starts near the middle of NTU and moves to DEMO_GRID_ORIGIN when you run the seed again (no second copy)', async () => {
    await seedSyntheticCatalog(prisma());
    const hallA = () => prisma().campusLocation.findUniqueOrThrow({ where: { name: '[DEMO] Hall A' } });
    expect((await hallA()).latitude).toBeCloseTo(1.348, 4);
    const before = await prisma().pickupPoint.count();

    process.env.DEMO_GRID_ORIGIN = '1.3478, 103.6803';
    try {
      expect(await seedSyntheticCatalog(prisma())).toBe(5);
    } finally {
      delete process.env.DEMO_GRID_ORIGIN;
    }
    expect(await prisma().campusLocation.count()).toBe(5);
    expect(await prisma().pickupPoint.count()).toBe(before);
    const a = await hallA();
    expect([a.latitude, a.longitude]).toEqual([1.3478, 103.6803]);
    const stop = await prisma().pickupPoint.findFirstOrThrow({ where: { accessNote: '[DEMO] Hall A bus stop' } });
    expect(haversineM({ lat: a.latitude, lng: a.longitude }, { lat: stop.latitude, lng: stop.longitude })).toBeLessThan(60);
  });

  it('seeding the [DEMO] grid never touches a place that is not a [DEMO] place', async () => {
    await prisma().campusLocation.create({ data: { name: 'Hall 1', zone: 'HALLS', isExit: false, latitude: 1.3501, longitude: 103.6801 } });
    await seedSyntheticCatalog(prisma());
    const real = await prisma().campusLocation.findUniqueOrThrow({ where: { name: 'Hall 1' } });
    expect([real.latitude, real.longitude]).toEqual([1.3501, 103.6801]);
  });
});
