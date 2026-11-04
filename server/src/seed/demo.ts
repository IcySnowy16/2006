/**
 * Task Q5: the demo data. Two opt-in pieces, both loudly labelled:
 *
 *   1. demo people with a known password (NOT for production), verified, with the wallets the demo scenes need: Dana holds BOTH roles
 *      (Choose Role, role switch) and has a vehicle and two presets; Priya can pay (ENOUGH); Wei is under $2 (cannot ask for a ride);
 *      Sam has $2.50 (the low-balance warning, and a solo $3 ride is NOT_ENOUGH); Lee is LOCKED with a debt. So the team can rehearse the whole flow without registering each time;
 *   2. a SYNTHETIC campus (SEED_SYNTHETIC_CATALOG=1) of "[DEMO]" places on a made-up grid laid out from DEMO_GRID_ORIGIN (default: near the
 *      middle of NTU). The places are NOT the real halls or gates: they exist so the app can be tried, and shown as an idea, before the
 *      real catalog has been geocoded and reviewed.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

export const DEMO_PASSWORD = 'demo-password-1';

export const DEMO_USERS = [
  {
    key: 'driver',
    name: 'Dana Driver',
    email: 'demo.driver@e.ntu.edu.sg',
    phone: '81110001',
    isDriver: true,
    isPassenger: true,
    balanceCents: 0,
    completedRides: 5,
  },
  {
    key: 'rider1',
    name: 'Priya Rider',
    email: 'demo.rider1@e.ntu.edu.sg',
    phone: '81110002',
    isDriver: false,
    isPassenger: true,
    balanceCents: 2000,
    completedRides: 4,
  },
  {
    key: 'rider2',
    name: 'Wei Rider',
    email: 'demo.rider2@e.ntu.edu.sg',
    phone: '81110003',
    isDriver: false,
    isPassenger: true,
    balanceCents: 100,
    completedRides: 0,
  },
  {
    key: 'rider3',
    name: 'Sam Low',
    email: 'demo.rider3@e.ntu.edu.sg',
    phone: '81110004',
    isDriver: false,
    isPassenger: true,
    balanceCents: 250,
    completedRides: 3,
  },
  {
    key: 'locked',
    name: 'Lee Locked',
    email: 'demo.locked@e.ntu.edu.sg',
    phone: '81110005',
    isDriver: false,
    isPassenger: true,
    balanceCents: 0,
    completedRides: 3,
  },
] as const;

export async function seedDemoUsers(db: PrismaClient): Promise<string[]> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const made: string[] = [];
  for (const u of DEMO_USERS) {
    const user = await db.user.upsert({
      where: { ntuEmail: u.email },
      create: {
        name: u.name,
        ntuEmail: u.email,
        phone: u.phone,
        passwordHash,
        isDriver: u.isDriver,
        isPassenger: u.isPassenger,
        accountStatus: 'ACTIVE',
        completedRides: u.completedRides,
      },
      update: { name: u.name, phone: u.phone, passwordHash, accountStatus: 'ACTIVE', completedRides: u.completedRides },
    });
    await db.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id, balanceCents: u.balanceCents }, update: {} });
    if (u.isDriver) {
      await db.driverProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, vehiclePlate: 'SDEMO1D', vehicleModel: 'Demo Car', payNowId: u.phone },
        update: {},
      });
    }
    made.push(u.email);
  }
  return made;
}

/**
 * Where "[DEMO] Hall A" is. The default is near the middle of NTU (approximate, NOT a surveyed point). To put the whole grid where you are
 * standing, put `DEMO_GRID_ORIGIN=1.3478,103.6803` (latitude,longitude, as Google Maps copies it) in `.env` and run `npm run demo:reset`.
 */
export const DEFAULT_DEMO_ORIGIN = { lat: 1.348, lng: 103.683 };

export function demoGridOrigin(env: Record<string, string | undefined> = process.env): { lat: number; lng: number } {
  const raw = env.DEMO_GRID_ORIGIN?.trim();
  if (!raw) return DEFAULT_DEMO_ORIGIN;
  const m = /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/.exec(raw);
  const lat = m ? Number(m[1]) : NaN;
  const lng = m ? Number(m[2]) : NaN;
  if (!m || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    throw new Error(`DEMO_GRID_ORIGIN must be "latitude,longitude", for example "1.3478,103.6803"; got "${raw}".`);
  }
  return { lat, lng };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Five invented places laid out from the origin: about 0.9 km east-west and 0.7 km north-south. Every name starts with [DEMO]. */
export function demoGrid(origin: { lat: number; lng: number } = demoGridOrigin()) {
  const at = (dLat: number, dLng: number) => ({ lat: round6(origin.lat + dLat), lng: round6(origin.lng + dLng) });
  return [
    {
      name: '[DEMO] Hall A',
      zone: 'HALLS' as const,
      isExit: false,
      ...at(0, 0),
      stops: [{ note: '[DEMO] Hall A bus stop', type: 'BUS_STOP' as const, ...at(0, 0.0003), walk: 80 }],
    },
    {
      name: '[DEMO] Hall B',
      zone: 'HALLS' as const,
      isExit: false,
      ...at(0, 0.002),
      stops: [{ note: '[DEMO] Hall B bus stop', type: 'BUS_STOP' as const, ...at(0.0003, 0.0022), walk: 60 }],
    },
    {
      name: '[DEMO] Library',
      zone: 'ACADEMIC' as const,
      isExit: false,
      ...at(0.003, 0.004),
      stops: [{ note: '[DEMO] Library carpark', type: 'CARPARK' as const, ...at(0.0031, 0.0041), walk: 120 }],
    },
    {
      name: '[DEMO] Main Gate',
      zone: 'GATE' as const,
      isExit: true,
      ...at(0.006, 0),
      stops: [{ note: '[DEMO] Main Gate bus stop', type: 'BUS_STOP' as const, ...at(0.0059, 0.0001), walk: 40 }],
    },
    {
      name: '[DEMO] Pioneer Gate',
      zone: 'GATE' as const,
      isExit: true,
      ...at(0, 0.008),
      stops: [{ note: '[DEMO] Pioneer Gate bus stop', type: 'BUS_STOP' as const, ...at(0.0001, 0.0079), walk: 30 }],
    },
  ];
}

/** Creates the [DEMO] places, or moves the ones that exist to the current origin (so changing DEMO_GRID_ORIGIN and re-running is enough). */
export async function seedSyntheticCatalog(db: PrismaClient): Promise<number> {
  const places = demoGrid();
  for (const p of places) {
    const loc = await db.campusLocation.upsert({
      where: { name: p.name },
      create: { name: p.name, zone: p.zone, isExit: p.isExit, latitude: p.lat, longitude: p.lng },
      update: { latitude: p.lat, longitude: p.lng },
    });
    for (const s of p.stops) {
      const have = await db.pickupPoint.findFirst({ where: { locationId: loc.id, accessNote: s.note } });
      if (have) {
        await db.pickupPoint.update({ where: { id: have.id }, data: { latitude: s.lat, longitude: s.lng, walkDistanceM: s.walk } });
      } else {
        await db.pickupPoint.create({
          data: { locationId: loc.id, type: s.type, walkDistanceM: s.walk, latitude: s.lat, longitude: s.lng, accessNote: s.note },
        });
      }
    }
  }
  return places.length;
}

/**
 * The rest of the demo scenario (task Q5): the driver's two presets, and a finished trip on which Lee could not pay, so Lee is LOCKED
 * with a real Debt of $0.70 (top up $0.70 and the account unlocks). Needs the campus catalog (real or synthetic) to hold an exit gate
 * and a pickup point; returns what it could not do, never invents places.
 */
export async function seedDemoScenario(db: PrismaClient, now: Date = new Date()): Promise<string[]> {
  const notes: string[] = [];
  const gate = await db.campusLocation.findFirst({ where: { isExit: true }, orderBy: { name: 'asc' } });
  const stop = await db.pickupPoint.findFirst({ orderBy: { accessNote: 'asc' } });
  const dana = await db.user.findUnique({ where: { ntuEmail: 'demo.driver@e.ntu.edu.sg' } });
  const lee = await db.user.findUnique({ where: { ntuEmail: 'demo.locked@e.ntu.edu.sg' } });
  if (!gate || !stop || !dana || !lee)
    return ['No exit gate or pickup point in the catalog yet: presets and the locked account were skipped. Seed the catalog first.'];

  if ((await db.driverPreset.count({ where: { driverId: dana.id } })) === 0) {
    const base = {
      driverId: dana.id,
      exitGateId: gate.id,
      allowedPickupTypes: ['BUS_STOP' as const, 'CARPARK' as const],
      scheduleDays: [],
      exemptionConfirmedAt: now,
    };
    await db.driverPreset.create({ data: { ...base, name: 'Shared ride to the gate', plan: 'SHARING', detourToleranceMin: 5 } });
    await db.driverPreset.create({ data: { ...base, name: 'Solo run to the gate', plan: 'SOLO', detourToleranceMin: 3 } });
    notes.push('Dana has 2 presets');
  }
  if ((await db.debt.count({ where: { userId: lee.id } })) === 0) {
    const yesterday = new Date(now.getTime() - 24 * 3_600_000);
    const journey = await db.journey.create({
      data: {
        driverId: dana.id,
        plan: 'SOLO',
        status: 'COMPLETED',
        seatsAvailable: 0,
        departureTime: yesterday,
        liveExpiresAt: yesterday,
        startedAt: yesterday,
        completedAt: yesterday,
      },
    });
    const booking = await db.booking.create({
      data: {
        journeyId: journey.id,
        passengerId: lee.id,
        status: 'COMPLETED',
        pickupStatus: 'UNPAID',
        paymentStatus: 'UNPAID',
        bookedOnTrust: false,
        currentFareCents: 300,
        finalFareCents: 300,
        pickupPointId: stop.id,
        dropoffPointId: stop.id,
      },
    });
    await db.debt.create({ data: { userId: lee.id, bookingId: booking.id, amountCents: 70, createdAt: yesterday } });
    await db.user.update({ where: { id: lee.id }, data: { accountStatus: 'LOCKED', unpaidCount: 1 } });
    notes.push('Lee is LOCKED with a $0.70 debt');
  }
  return notes;
}
