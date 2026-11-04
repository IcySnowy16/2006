/**
 * Database factories for integration tests (task K4). Each call inserts a valid row with sensible defaults; pass
 * overrides for the one field a test is about.
 *
 * The campus catalog here is SYNTHETIC: a small grid of made-up coordinates around 1.0 N, 103.0 E (about 11 m per 0.0001
 * degree). They are NOT real NTU coordinates and must never be mistaken for the real catalog (task F6 seeds that from a
 * reviewed file).
 */
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/core/prisma';
import { encodePolyline } from '@campus-hop/shared';
import type { LatLng } from '../../src/core/geo';
import { nextSeq } from './factories';

export const TEST_PASSWORD = 'correct-horse-battery';
/** bcrypt cost 4 keeps the tests fast; production uses a higher cost (AuthService). */
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

export interface UserOverrides {
  name?: string;
  ntuEmail?: string;
  isDriver?: boolean;
  isPassenger?: boolean;
  accountStatus?: 'PENDING_VERIFICATION' | 'ACTIVE' | 'LOCKED';
  lastActiveRole?: 'DRIVER' | 'PASSENGER' | null;
  completedRides?: number;
  unpaidCount?: number;
  balanceCents?: number;
  heldCents?: number;
}

export async function makeUser(o: UserOverrides = {}) {
  const n = nextSeq();
  const { balanceCents = 0, heldCents = 0, ...rest } = o;
  const user = await prisma().user.create({
    data: {
      name: `Test User ${n}`,
      ntuEmail: `user${n}@e.ntu.edu.sg`,
      phone: `9${String(1000000 + n).slice(-7)}`,
      passwordHash: TEST_HASH,
      accountStatus: 'ACTIVE',
      isPassenger: true,
      ...rest,
      wallet: { create: { balanceCents, heldCents } },
    },
  });
  return user;
}

export async function makePassenger(o: UserOverrides = {}) {
  return makeUser({ isPassenger: true, isDriver: false, ...o });
}

export async function makeDriver(o: UserOverrides & { dailyPaidTrips?: number; lastPaidTripDate?: string | null } = {}) {
  const { dailyPaidTrips = 0, lastPaidTripDate = null, ...rest } = o;
  const user = await makeUser({ isDriver: true, isPassenger: false, ...rest });
  await prisma().driverProfile.create({
    data: {
      userId: user.id,
      vehiclePlate: `SBA${1000 + user.id.length}A`,
      vehicleModel: 'Toyota Vios',
      payNowId: user.phone,
      dailyPaidTrips,
      lastPaidTripDate,
    },
  });
  return user;
}

/** Synthetic positions (see the note at the top of this file). */
export const TEST_POS = {
  hallA: { lat: 1.0, lng: 103.0 },
  hallB: { lat: 1.0, lng: 103.002 },
  nie: { lat: 1.003, lng: 103.004 },
  mainGate: { lat: 1.006, lng: 103.0 },
  pioneerGate: { lat: 1.0, lng: 103.008 },
  /** A square that contains every point above, for geofence tests. */
  boundary: [
    { lat: 0.99, lng: 102.99 },
    { lat: 0.99, lng: 103.02 },
    { lat: 1.02, lng: 103.02 },
    { lat: 1.02, lng: 102.99 },
  ] as LatLng[],
};

/** Place names are made unique per call, so a test may build two catalogs (for example two separate trips in one test). */
export async function makeCatalog() {
  const n = nextSeq();
  const mk = (name: string, zone: 'HALLS' | 'ACADEMIC' | 'GATE', p: LatLng) =>
    prisma().campusLocation.create({ data: { name: `${name} ${n}`, zone, isExit: zone === 'GATE', latitude: p.lat, longitude: p.lng } });
  const [hallA, hallB, nie, mainGate, pioneerGate] = await Promise.all([
    mk('Test Hall A', 'HALLS', TEST_POS.hallA),
    mk('Test Hall B', 'HALLS', TEST_POS.hallB),
    mk('Test NIE', 'ACADEMIC', TEST_POS.nie),
    mk('Test Main Gate', 'GATE', TEST_POS.mainGate),
    mk('Test Pioneer Gate', 'GATE', TEST_POS.pioneerGate),
  ]);
  const pp = (loc: { id: string }, type: 'BUS_STOP' | 'CARPARK', walk: number, p: LatLng) =>
    prisma().pickupPoint.create({ data: { locationId: loc.id, type, walkDistanceM: walk, latitude: p.lat, longitude: p.lng } });
  const [hallABus, hallBBus, nieCarpark, gateBus] = await Promise.all([
    pp(hallA, 'BUS_STOP', 80, { lat: 1.0, lng: 103.0003 }),
    pp(hallB, 'BUS_STOP', 60, { lat: 1.0003, lng: 103.0022 }),
    pp(nie, 'CARPARK', 120, { lat: 1.0031, lng: 103.0041 }),
    pp(mainGate, 'BUS_STOP', 40, { lat: 1.0059, lng: 103.0001 }),
  ]);
  return { hallA, hallB, nie, mainGate, pioneerGate, pickup: { hallABus, hallBBus, nieCarpark, gateBus } };
}

export async function makePreset(driverId: string, exitGateId: string, o: Partial<Prisma.DriverPresetUncheckedCreateInput> = {}) {
  return prisma().driverPreset.create({
    data: {
      driverId,
      exitGateId,
      name: `Preset ${nextSeq()}`,
      plan: 'SHARING',
      allowedPickupTypes: ['BUS_STOP', 'CARPARK'],
      detourToleranceMin: 5,
      scheduleDays: [],
      exemptionConfirmedAt: new Date('2026-10-19T00:00:00Z'),
      ...o,
    },
  });
}

/** A straight route from `from` to `to`, stored with the journey (the real one comes from the Maps adapter). */
export function straightRoute(from: LatLng, to: LatLng) {
  const points = [from, { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }, to];
  return { polyline: encodePolyline(points), points: points as unknown as Prisma.InputJsonValue, durationSec: 300, distanceM: 1000 };
}

export interface JourneyOverrides {
  status?: Prisma.JourneyUncheckedCreateInput['status'];
  plan?: 'SOLO' | 'SHARING';
  seatsAvailable?: number;
  departureTime?: Date;
  liveExpiresAt?: Date;
  presetId?: string | null;
  from?: LatLng;
  to?: LatLng;
}

export async function makeJourney(driverId: string, o: JourneyOverrides = {}) {
  const plan = o.plan ?? 'SHARING';
  const departureTime = o.departureTime ?? new Date('2026-10-19T08:00:00Z');
  return prisma().journey.create({
    data: {
      driverId,
      plan,
      status: o.status ?? 'LIVE',
      seatsAvailable: o.seatsAvailable ?? (plan === 'SOLO' ? 1 : 3),
      departureTime,
      liveExpiresAt: o.liveExpiresAt ?? new Date(departureTime.getTime() + 15 * 60_000),
      presetId: o.presetId ?? null,
      route: { create: straightRoute(o.from ?? TEST_POS.hallA, o.to ?? TEST_POS.mainGate) },
    },
    include: { route: true },
  });
}

export interface BookingOverrides {
  status?: Prisma.BookingUncheckedCreateInput['status'];
  pickupStatus?: Prisma.BookingUncheckedCreateInput['pickupStatus'];
  paymentStatus?: Prisma.BookingUncheckedCreateInput['paymentStatus'];
  currentFareCents?: number;
  heldCents?: number;
  bookedOnTrust?: boolean;
  hopRequestId?: string | null;
}

export async function makeBooking(journeyId: string, passengerId: string, pickupPointId: string, dropoffPointId: string, o: BookingOverrides = {}) {
  return prisma().booking.create({
    data: { journeyId, passengerId, pickupPointId, dropoffPointId, status: 'PENDING', pickupStatus: 'WAITING', currentFareCents: 300, ...o },
  });
}
