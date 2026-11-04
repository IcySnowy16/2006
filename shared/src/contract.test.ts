import { describe, expect, it } from 'vitest';
import { Cents, ENDPOINTS, ERROR_CODES, ErrorBody, errorsFor, type Endpoint, type EndpointName } from './index';
import { PresetBody, RegisterBody, VerifyBody } from './endpoints/account';
import { HopRequestBody } from './endpoints/hop';
import { Contact, RatingBody, TopUpBody } from './endpoints/trip';
import { DECISIONS, DEFAULTS } from './defaults';
import { FEATURE_DEFAULTS, resolveFlags } from './features';

const names = Object.keys(ENDPOINTS) as EndpointName[];
const rows = names.map((n) => ({ name: n, ...(ENDPOINTS[n] as Endpoint) }));

/** The 17 current use cases (v2.3); UC-9, 16, 17, 18 and 22 are retired. */
const CURRENT_UCS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 19, 20, 21].map((n) => `UC-${n}`);

describe('endpoint table', () => {
  it('every path is under /api and every method + path is unique', () => {
    const keys = rows.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of rows) expect(r.path.startsWith('/api/')).toBe(true);
  });

  it('only lists real error codes, with no duplicates in a row', () => {
    for (const r of rows) {
      for (const c of r.errors) expect(ERROR_CODES).toContain(c);
      expect(new Set(r.errors).size).toBe(r.errors.length);
    }
  });

  it('only traces to current use cases', () => {
    for (const r of rows) for (const uc of r.useCases) expect(CURRENT_UCS).toContain(uc);
  });

  it('covers every current use case (UC-15 live tracking runs over the WebSocket; its REST part is the contact route)', () => {
    const covered = new Set(rows.flatMap((r) => [...r.useCases]));
    const missing = CURRENT_UCS.filter((uc) => !covered.has(uc));
    expect(missing).toEqual([]);
  });

  it('contact is by phone: there is no message route, and the contact route is for signed-in users', () => {
    expect(names).not.toContain('messages.send');
    expect(ENDPOINTS['bookings.contact']).toMatchObject({ method: 'GET', path: '/api/bookings/:id/contact', access: 'user' });
  });

  it('bodies only on POST and PUT, and GET routes never carry a body', () => {
    for (const r of rows) if (r.method === 'GET' || r.method === 'DELETE') expect(r.body).toBeUndefined();
  });

  it('adds the auth errors to non-public routes only', () => {
    expect(errorsFor('auth.login')).not.toContain('AUTH_REQUIRED');
    expect(errorsFor('wallet.get')).toContain('AUTH_REQUIRED');
    expect(errorsFor('wallet.get')).toContain('VALIDATION_ERROR');
  });
});

describe('schemas enforce the SRS rules', () => {
  const register = { name: 'Ann', ntuEmail: 'Ann001@E.NTU.EDU.SG', phone: '91234567', password: 'longenough', role: 'BOTH' };

  it('register: lower-cases the email and accepts a valid body (FR 1.5)', () => {
    expect(RegisterBody.parse(register).ntuEmail).toBe('ann001@e.ntu.edu.sg');
  });
  it('register: rejects a short password, a bad phone and an unknown role', () => {
    expect(RegisterBody.safeParse({ ...register, password: 'short' }).success).toBe(false);
    expect(RegisterBody.safeParse({ ...register, phone: '12ab' }).success).toBe(false);
    expect(RegisterBody.safeParse({ ...register, role: 'ADMIN' }).success).toBe(false);
  });
  it('verify: the code has exactly 6 digits', () => {
    expect(VerifyBody.safeParse({ ntuEmail: 'a@e.ntu.edu.sg', code: '12345' }).success).toBe(false);
    expect(VerifyBody.safeParse({ ntuEmail: 'a@e.ntu.edu.sg', code: '123456' }).success).toBe(true);
  });

  const preset = { name: 'Home', exitGateId: 'g1', plan: 'SHARING', allowedPickupTypes: ['BUS_STOP'], detourToleranceMin: 5, exemptionConfirmed: true };
  it('preset: tolerance 5 passes, 6 fails (FR 3.1.4)', () => {
    expect(PresetBody.safeParse(preset).success).toBe(true);
    expect(PresetBody.safeParse({ ...preset, detourToleranceMin: 6 }).success).toBe(false);
  });
  it('preset: needs at least one pickup type and the exemption declaration (FR 3.1.3, 3.1.6)', () => {
    expect(PresetBody.safeParse({ ...preset, allowedPickupTypes: [] }).success).toBe(false);
    expect(PresetBody.safeParse({ ...preset, exemptionConfirmed: false }).success).toBe(false);
  });

  it('hop request: origin and destination must differ', () => {
    expect(HopRequestBody.safeParse({ fromLocationId: 'a', toLocationId: 'a' }).success).toBe(false);
    expect(HopRequestBody.safeParse({ fromLocationId: 'a', toLocationId: 'b' }).success).toBe(true);
  });

  it('rating: 1 to 5 stars and at most 200 characters (FR 9.1, 9.1.1)', () => {
    expect(RatingBody.safeParse({ stars: 0 }).success).toBe(false);
    expect(RatingBody.safeParse({ stars: 6 }).success).toBe(false);
    expect(RatingBody.safeParse({ stars: 5, comment: 'x'.repeat(200) }).success).toBe(true);
    expect(RatingBody.safeParse({ stars: 5, comment: 'x'.repeat(201) }).success).toBe(false);
  });

  it('top-up: whole cents, from $1 to the wallet limit of $100 (NFR-6.5); zero and negative amounts are refused', () => {
    expect(TopUpBody.safeParse({ amountCents: 10_000 }).success).toBe(true);
    expect(TopUpBody.safeParse({ amountCents: 100 }).success).toBe(true);
    expect(TopUpBody.safeParse({ amountCents: 10_001 }).success).toBe(false);
    expect(TopUpBody.safeParse({ amountCents: 99 }).success).toBe(false);
    expect(TopUpBody.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(TopUpBody.safeParse({ amountCents: -500 }).success).toBe(false);
    expect(TopUpBody.safeParse({ amountCents: 10.5 }).success).toBe(false);
  });

  it('money is never a float or negative', () => {
    expect(Cents.safeParse(300).success).toBe(true);
    expect(Cents.safeParse(2.5).success).toBe(false);
    expect(Cents.safeParse(-1).success).toBe(false);
  });

  it('contact: first name and phone number, nothing else', () => {
    expect(Contact.safeParse({ firstName: 'Ann', phone: '+6591234567' }).success).toBe(true);
    expect(Contact.safeParse({ firstName: 'Ann' }).success).toBe(false);
  });

  it('phone (grill Q5): spaces, dashes, dots and brackets are removed first; 8 to 15 digits with an optional +', () => {
    const phone = (p: string) => RegisterBody.safeParse({ ...register, phone: p });
    expect(phone('+65 9123 4567').success && phone('+65 9123 4567').data?.phone).toBe('+6591234567');
    expect(phone('9123-4567').success && phone('9123-4567').data?.phone).toBe('91234567');
    expect(phone('(65) 9123.4567').success && phone('(65) 9123.4567').data?.phone).toBe('6591234567');
    expect(phone('1234567').success).toBe(false);
    expect(phone('1234567890123456').success).toBe(false);
    expect(phone('12ab5678').success).toBe(false);
  });

  it('error body: flat code + message, code must be known', () => {
    expect(ErrorBody.safeParse({ code: 'NOT_FOUND', message: 'x', requestId: 'r1' }).success).toBe(true);
    expect(ErrorBody.safeParse({ code: 'MADE_UP', message: 'x' }).success).toBe(false);
  });
});

describe('defaults and feature flags', () => {
  it('every decision names its source, question, answer and where it is applied', () => {
    for (const d of DECISIONS)
      for (const k of ['source', 'question', 'answer', 'appliedIn'] as const) expect(d[k].length, `${d.source} ${k}`).toBeGreaterThan(0);
    expect(DECISIONS.filter((d) => d.source.startsWith('Grill')).length).toBe(7);
    expect(new Set(DECISIONS.map((d) => d.source)).size).toBe(DECISIONS.length);
  });

  it('the default numbers match the SRS', () => {
    expect(DEFAULTS).toMatchObject({
      SHARING_SEAT_CAP: 3,
      FARE_SOLO_CENTS: 300,
      FARE_SHARED_CENTS: 200,
      WALLET_CAP_CENTS: 10_000,
      LOW_BALANCE_WARN_CENTS: 300,
      MIN_BALANCE_TO_RIDE_CENTS: 200,
      MAX_PAID_TRIPS_PER_DAY: 2,
      CONTACT_WINDOW_MIN: 30,
    });
    expect(DEFAULTS.EXIT_GATES).toHaveLength(3);
    expect(FEATURE_DEFAULTS.bookOnTrust).toBe(false); // booking on trust is switched off for now
  });

  it('feature flags: defaults apply, FEATURE_<NAME> overrides, junk is ignored', () => {
    expect(resolveFlags({})).toEqual(FEATURE_DEFAULTS);
    expect(resolveFlags({ FEATURE_CONTACT_CALL: 'false', FEATURE_SCHEDULED_GO_LIVE: 'true', FEATURE_REORDER_PICKUPS: 'maybe' })).toMatchObject({
      contactCall: false,
      scheduledGoLive: true,
      reorderPickups: false,
    });
  });
});
