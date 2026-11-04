/** Task F7a: a driver's reusable journey setup (FR 3.1.1 to 3.1.6). */
import type { PickupType, Plan } from '@campus-hop/shared';
import { DEFAULTS } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';

export interface DriverPresetRecord {
  id: string;
  driverId: string;
  name: string;
  exitGateId: string;
  plan: Plan;
  allowedPickupTypes: PickupType[];
  detourToleranceMin: number;
  scheduleDays: string[];
  scheduleDepartAt: string | null;
  exemptionConfirmedAt: Date | null;
}

/** FR 3.1.4: at most 5 minutes of detour. */
export const MAX_DETOUR_TOLERANCE_MIN = 5;

export class DriverPreset {
  private constructor(private rec: DriverPresetRecord) {}

  /** Rejects a tolerance above 5, a negative one, an empty pickup-type list or a name that is blank (VALIDATION_ERROR). */
  static fromRecord(rec: DriverPresetRecord): DriverPreset {
    const problems: { path: string; message: string }[] = [];
    if (!rec.name.trim()) problems.push({ path: 'name', message: 'Give the preset a name' });
    if (rec.detourToleranceMin < 0 || rec.detourToleranceMin > MAX_DETOUR_TOLERANCE_MIN)
      problems.push({ path: 'detourToleranceMin', message: 'The detour tolerance is at most 5 minutes' });
    if (rec.allowedPickupTypes.length === 0) problems.push({ path: 'allowedPickupTypes', message: 'Choose at least one pickup type' });
    if (problems.length) throw new AppError('VALIDATION_ERROR', { details: problems });
    return new DriverPreset({ ...rec, allowedPickupTypes: [...rec.allowedPickupTypes], scheduleDays: [...rec.scheduleDays] });
  }

  toRecord(): DriverPresetRecord {
    return { ...this.rec, allowedPickupTypes: [...this.rec.allowedPickupTypes], scheduleDays: [...this.rec.scheduleDays] };
  }

  get id(): string {
    return this.rec.id;
  }
  get plan(): Plan {
    return this.rec.plan;
  }
  /** SOLO carries one rider, SHARING up to the cap (SRS Q4 default: 3). */
  get seats(): number {
    return this.rec.plan === 'SOLO' ? 1 : DEFAULTS.SHARING_SEAT_CAP;
  }
  get exemptionConfirmed(): boolean {
    return this.rec.exemptionConfirmedAt !== null;
  }

  matchesPickupType(type: PickupType): boolean {
    return this.rec.allowedPickupTypes.includes(type);
  }

  /** Never true above 5 minutes, whatever the tolerance says (FR 3.1.4). */
  withinDetourTolerance(extraMin: number): boolean {
    return extraMin <= Math.min(this.rec.detourToleranceMin, MAX_DETOUR_TOLERANCE_MIN);
  }

  /** FR 3.1.6: the driver confirms that these journeys happen whether or not a passenger joins. */
  confirmExemption(now: Date): void {
    this.rec.exemptionConfirmedAt = now;
  }
}
