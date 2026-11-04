/**
 * Test-data factories (task K4). Each call returns a fresh, VALID object with unique values; pass
 * overrides for the one field a test is about. Request-body factories are typed from the shared
 * contract, and a test checks they still pass its schemas, so they cannot drift from the API.
 * Database factories (makeUser, makeJourney, ...) join this file once F5 and F7 exist.
 */
import type { Account, Hop } from '@campus-hop/shared';

let seq = 0;
/** A number unique within the test run, for emails, names and ids. */
export const nextSeq = (): number => ++seq;

export function factory<T extends object>(defaults: (n: number) => T) {
  return (overrides: Partial<T> = {}): T => ({ ...defaults(nextSeq()), ...overrides });
}

export const registerBody = factory<Account.RegisterBody>((n) => ({
  name: `Test User ${n}`,
  ntuEmail: `user${n}@e.ntu.edu.sg`,
  phone: `9${String(1000000 + n).slice(-7)}`,
  password: 'correct-horse-battery',
  role: 'BOTH',
}));

export const loginBody = factory<Account.LoginBody>((n) => ({
  ntuEmail: `user${n}@e.ntu.edu.sg`,
  password: 'correct-horse-battery',
}));

export const presetBody = factory<Account.PresetBody>((n) => ({
  name: `Preset ${n}`,
  exitGateId: 'gate-main',
  plan: 'SHARING',
  allowedPickupTypes: ['BUS_STOP'],
  detourToleranceMin: 5,
  schedule: null,
  exemptionConfirmed: true,
}));

export const hopRequestBody = factory<Hop.HopRequestBody>(() => ({
  fromLocationId: 'hall-1',
  toLocationId: 'nie',
}));

export const bookBody = factory<Hop.BookBody>((n) => ({
  journeyId: `journey-${n}`,
  pickupPointId: 'pp-hall-1-bus',
  dropoffPointId: 'pp-nie-carpark',
}));
