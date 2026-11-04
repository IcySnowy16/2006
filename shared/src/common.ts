/** Building blocks reused by the endpoint schemas. */
import { z } from 'zod';

/** Database ids are opaque strings; never parse meaning out of them. */
export const Id = z.string().min(1).max(64);

/** Money is always integer cents in the contract (SGD). $3.00 is 300. Never a float. */
export const Cents = z.int().nonnegative();

/** Timestamps travel as ISO-8601 UTC strings, e.g. 2026-10-13T08:30:00.000Z. */
export const IsoDateTime = z.iso.datetime();

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** A device position as the phone reports it (NFR-1.6 needs the accuracy). */
export const Position = LatLng.extend({
  accuracyM: z.number().nonnegative(),
  ts: IsoDateTime,
});

/** NTU address shape only. The NTU-domain RULE is checked by the server (FR 1.1) so it can answer EMAIL_DOMAIN_NOT_ALLOWED. */
export const Email = z
  .email()
  .max(254)
  .transform((e) => e.toLowerCase());

export type Id = z.infer<typeof Id>;
export type Cents = z.infer<typeof Cents>;
export type LatLng = z.infer<typeof LatLng>;
export type Position = z.infer<typeof Position>;
