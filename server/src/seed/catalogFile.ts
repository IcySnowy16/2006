/**
 * Task F6: the campus catalog file, and the rule that decides what may be seeded.
 *
 * COORDINATES ARE NEVER INVENTED. A place is seeded only when its entry says `reviewed: true` and it, and every one of its pickup
 * points, has coordinates. The file starts with names only (prisma/data/campus-catalog.template.json, from the team's
 * Labs/lab1/campus_location_catalog.md); `npm run geocode` fills in candidates from the Google Geocoding API; a PERSON checks each
 * on a map and flips `reviewed`. Anything not reviewed is skipped and reported, so the seed never puts a guess on the map.
 */
import { z } from 'zod';
import { haversineM } from '../core/geo';

const Coord = z.number().finite();

export const CatalogPickup = z.object({
  name: z.string().min(1),
  type: z.enum(['BUS_STOP', 'CARPARK']),
  note: z.string().nullable().default(null),
  lat: Coord.nullable().default(null),
  lng: Coord.nullable().default(null),
  /** Walking metres from the place to this pickup point. null: the placeholder straight-line x 1.3 is used (the catalog document says so). */
  walkDistanceM: z.number().nonnegative().nullable().default(null),
});

export const CatalogPlace = z.object({
  name: z.string().min(1),
  zone: z.enum(['HALLS', 'ACADEMIC', 'GATE']),
  isExit: z.boolean().default(false),
  lat: Coord.nullable().default(null),
  lng: Coord.nullable().default(null),
  /** Set by a person after checking every coordinate of this place on a map. */
  reviewed: z.boolean().default(false),
  source: z.string().nullable().default(null),
  pickupPoints: z.array(CatalogPickup).min(1),
});

export const CatalogFile = z.object({ version: z.literal(1), about: z.string().optional(), places: z.array(CatalogPlace).min(1) });

export type CatalogFile = z.output<typeof CatalogFile>;
export type CatalogPlace = z.output<typeof CatalogPlace>;
export type CatalogPickup = z.output<typeof CatalogPickup>;

export interface ReadyPlace {
  place: CatalogPlace;
  /** Pickup points with their coordinates and walking distance resolved. */
  pickups: { name: string; type: 'BUS_STOP' | 'CARPARK'; note: string | null; lat: number; lng: number; walkDistanceM: number }[];
}

export interface Skipped {
  name: string;
  reason: string;
}

export function parseCatalog(json: unknown): CatalogFile {
  return CatalogFile.parse(json);
}

/** Straight-line distance x 1.3, rounded: the documented placeholder until real walking distances are fetched. */
export function walkPlaceholder(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(haversineM(a, b) * 1.3);
}

/** Which places may be seeded, and why the others may not. */
export function selectSeedable(catalog: CatalogFile): { ready: ReadyPlace[]; skipped: Skipped[] } {
  const ready: ReadyPlace[] = [];
  const skipped: Skipped[] = [];
  for (const place of catalog.places) {
    if (!place.reviewed) {
      skipped.push({ name: place.name, reason: 'not reviewed' });
      continue;
    }
    if (place.lat === null || place.lng === null) {
      skipped.push({ name: place.name, reason: 'reviewed but has no coordinates' });
      continue;
    }
    const missing = place.pickupPoints.find((p) => p.lat === null || p.lng === null);
    if (missing) {
      skipped.push({ name: place.name, reason: `pickup point "${missing.name}" has no coordinates` });
      continue;
    }
    const here = { lat: place.lat, lng: place.lng };
    ready.push({
      place,
      pickups: place.pickupPoints.map((p) => ({
        name: p.name,
        type: p.type,
        note: p.note,
        lat: p.lat!,
        lng: p.lng!,
        walkDistanceM: p.walkDistanceM ?? walkPlaceholder(here, { lat: p.lat!, lng: p.lng! }),
      })),
    });
  }
  return { ready, skipped };
}

/** What a rider sees for a pickup point: its name, then the note if there is one. Stored in PickupPoint.accessNote. */
export const pickupLabel = (p: { name: string; note: string | null }): string => (p.note ? `${p.name}: ${p.note}` : p.name);
