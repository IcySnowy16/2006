/**
 * Task B1: the driver's profile and journey presets (UC-3, FR 1.6, FR 3.1.1 to 3.1.6, NFR-6.3).
 *
 * Presets are the only place trip details are entered: there is no per-trip form. A preset can be saved only with the
 * "this journey happens anyway" declaration ticked (the zod schema allows only `true`), and the time of the declaration is stored.
 *
 * Saving a complete driver profile also gives a passenger-only user the DRIVER role, so nobody registers twice (UC-3).
 */
import type { Prisma } from '@prisma/client';
import { type Account, DEFAULTS } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { DriverPreset } from '../entities/DriverPreset';
import { AppError } from '../errors/AppError';
import { assertOwner } from '../middleware/ownership';

type PresetBody = z.output<typeof Account.PresetBody>;
type PresetDto = z.infer<typeof Account.Preset>;
type DriverProfileBody = z.output<typeof Account.DriverProfileBody>;
type DriverProfileDto = z.infer<typeof Account.DriverProfile>;

type ScheduleDays = NonNullable<PresetBody['schedule']>['days'];

const ACTIVE_JOURNEY = ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] as const;

export class PresetService {
  constructor(private readonly ctx: AppContext) {}

  // ---------------------------------------------------------------- driver profile (FR 1.6)

  async saveProfile(userId: string, body: DriverProfileBody): Promise<DriverProfileDto> {
    const db = this.ctx.db();
    const profile = await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isDriver: true } });
      return tx.driverProfile.upsert({
        where: { userId },
        create: { userId, ...body },
        update: body,
      });
    });
    return { vehiclePlate: profile.vehiclePlate, vehicleModel: profile.vehicleModel, payNowId: profile.payNowId, dailyPaidTrips: profile.dailyPaidTrips };
  }

  // ---------------------------------------------------------------- presets

  async list(driverId: string): Promise<PresetDto[]> {
    const rows = await this.ctx.db().driverPreset.findMany({ where: { driverId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toPreset);
  }

  async create(driverId: string, body: PresetBody): Promise<PresetDto> {
    const db = this.ctx.db();
    await this.checkGate(body.exitGateId);
    const count = await db.driverPreset.count({ where: { driverId } });
    if (count >= DEFAULTS.MAX_PRESETS_PER_DRIVER) {
      throw new AppError('CONFLICT', { message: `You can keep at most ${DEFAULTS.MAX_PRESETS_PER_DRIVER} presets. Delete one first.` });
    }
    const now = this.ctx.clock.now();
    const data = this.toData(body, now);
    DriverPreset.fromRecord({ id: 'new', driverId, ...data, exemptionConfirmedAt: now }); // the entity's own checks (name, 0-5, pickup types)
    const row = await db.driverPreset.create({ data: { driverId, ...data } });
    return toPreset(row);
  }

  async update(driverId: string, presetId: string, body: PresetBody): Promise<PresetDto> {
    const db = this.ctx.db();
    const existing = await db.driverPreset.findUnique({ where: { id: presetId } });
    if (!existing) throw new AppError('NOT_FOUND');
    assertOwner(existing.driverId, driverId, 'this preset');
    await this.checkGate(body.exitGateId);
    const now = this.ctx.clock.now();
    const data = this.toData(body, now);
    DriverPreset.fromRecord({ id: presetId, driverId, ...data, exemptionConfirmedAt: now });
    const row = await db.driverPreset.update({ where: { id: presetId }, data });
    return toPreset(row);
  }

  /** UC-3.EX.1: a preset with a journey that is LIVE, OPEN, FULL or IN_PROGRESS cannot be deleted. */
  async delete(driverId: string, presetId: string): Promise<void> {
    const db = this.ctx.db();
    const existing = await db.driverPreset.findUnique({ where: { id: presetId } });
    if (!existing) throw new AppError('NOT_FOUND');
    assertOwner(existing.driverId, driverId, 'this preset');
    const inUse = await db.journey.count({ where: { presetId, status: { in: [...ACTIVE_JOURNEY] } } });
    if (inUse > 0) throw new AppError('PRESET_IN_USE');
    await db.driverPreset.delete({ where: { id: presetId } });
  }

  // ---------------------------------------------------------------- internals

  /** FR 3.1.1: the exit must be one of the catalog's exit gates. Unknown id: NOT_FOUND. A real place that is not an exit: VALIDATION_ERROR. */
  private async checkGate(exitGateId: string): Promise<void> {
    const place = await this.ctx.db().campusLocation.findUnique({ where: { id: exitGateId } });
    if (!place) throw new AppError('NOT_FOUND', { message: 'That exit gate does not exist.' });
    if (!place.isExit) throw new AppError('VALIDATION_ERROR', { details: [{ path: 'exitGateId', message: 'Choose one of the campus exit gates' }] });
  }

  private toData(body: PresetBody, now: Date) {
    return {
      name: body.name,
      exitGateId: body.exitGateId,
      plan: body.plan,
      allowedPickupTypes: body.allowedPickupTypes,
      detourToleranceMin: body.detourToleranceMin,
      scheduleDays: body.schedule?.days ?? [],
      scheduleDepartAt: body.schedule?.departAt ?? null,
      exemptionConfirmedAt: now,
    };
  }
}

export function toPreset(row: Prisma.DriverPresetGetPayload<object>): PresetDto {
  return {
    id: row.id,
    name: row.name,
    exitGateId: row.exitGateId,
    plan: row.plan,
    allowedPickupTypes: row.allowedPickupTypes,
    detourToleranceMin: row.detourToleranceMin,
    schedule: row.scheduleDays.length > 0 && row.scheduleDepartAt ? { days: row.scheduleDays as ScheduleDays, departAt: row.scheduleDepartAt } : null,
    exemptionConfirmed: true,
    exemptionConfirmedAt: row.exemptionConfirmedAt.toISOString(),
  };
}
