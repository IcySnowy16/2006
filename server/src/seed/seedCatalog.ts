/** Task F6: writes the fare table and the reviewed part of the campus catalog. Safe to run again: it updates by name, never duplicates. */
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { DEFAULTS } from '@campus-hop/shared';
import { parseCatalog, pickupLabel, selectSeedable, type Skipped } from './catalogFile';

/** The fare table (FR 5.1): 1 rider $3.00; 2 or 3 riders $2.00 each. Read-only data: no endpoint edits it (NFR-6.1). */
export async function seedFareTiers(db: PrismaClient): Promise<void> {
  const tiers = [
    { riders: 1, perRiderCents: DEFAULTS.FARE_SOLO_CENTS },
    { riders: 2, perRiderCents: DEFAULTS.FARE_SHARED_CENTS },
    { riders: 3, perRiderCents: DEFAULTS.FARE_SHARED_CENTS },
  ];
  for (const t of tiers) await db.fareTier.upsert({ where: { riders: t.riders }, create: t, update: { perRiderCents: t.perRiderCents } });
}

export interface CatalogResult {
  seeded: { place: string; pickupPoints: number }[];
  skipped: Skipped[];
}

export async function seedCatalogFromFile(db: PrismaClient, path: string): Promise<CatalogResult> {
  const { ready, skipped } = selectSeedable(parseCatalog(JSON.parse(readFileSync(path, 'utf8'))));
  const seeded: CatalogResult['seeded'] = [];
  for (const { place, pickups } of ready) {
    const row = await db.campusLocation.upsert({
      where: { name: place.name },
      create: { name: place.name, zone: place.zone, isExit: place.isExit, latitude: place.lat!, longitude: place.lng! },
      update: { zone: place.zone, isExit: place.isExit, latitude: place.lat!, longitude: place.lng! },
    });
    for (const p of pickups) {
      const accessNote = pickupLabel(p);
      const existing = await db.pickupPoint.findFirst({ where: { locationId: row.id, accessNote } });
      const data = { type: p.type, walkDistanceM: p.walkDistanceM, latitude: p.lat, longitude: p.lng, accessNote };
      if (existing) await db.pickupPoint.update({ where: { id: existing.id }, data });
      else await db.pickupPoint.create({ data: { locationId: row.id, ...data } });
    }
    seeded.push({ place: place.name, pickupPoints: pickups.length });
  }
  return { seeded, skipped };
}
