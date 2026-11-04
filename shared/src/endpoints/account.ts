/** Account, role and profile: UC-1, UC-2, UC-3 (FR 1.x, 3.1.x). */
import { z } from 'zod';
import { Cents, Email, Id } from '../common';
import { AccountStatus, ActiveRole, PickupType, Plan, RoleHeld } from '../enums';

/**
 * Grill Q5 (default A): people type "+65 9123 4567" or "9123-4567", so spaces, dashes, dots and brackets are removed
 * first and what is left must be 8 to 15 digits with an optional leading +.
 */
export const Phone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+?\d{8,15}$/, 'Phone number: 8 to 15 digits'));

export const RegisterBody = z.object({
  name: z.string().trim().min(1).max(80),
  ntuEmail: Email,
  phone: Phone,
  password: z.string().min(8).max(128),
  role: RoleHeld,
});
export const RegisterResponse = z.object({ userId: Id });

export const VerifyBody = z.object({ ntuEmail: Email, code: z.string().regex(/^\d{6}$/, 'The code has 6 digits') });
export const ResendBody = z.object({ ntuEmail: Email });
export const LoginBody = z.object({ ntuEmail: Email, password: z.string().min(1).max(128) });

/** Who is signed in, which roles they hold and which one they are acting in (null = must choose, UC-2.AC.1). */
export const Me = z.object({
  id: Id,
  name: z.string(),
  roles: z.array(ActiveRole).min(1),
  activeRole: ActiveRole.nullable(),
  accountStatus: AccountStatus,
  wallet: z.object({ balanceCents: Cents, heldCents: Cents }),
  hasDriverProfile: z.boolean(),
});

export const ActiveRoleBody = z.object({ role: ActiveRole });
export const AddRoleBody = z.object({ add: z.literal('PASSENGER') });

export const DriverProfileBody = z.object({
  vehiclePlate: z.string().trim().min(2).max(12),
  vehicleModel: z.string().trim().min(1).max(60),
  payNowId: z.string().trim().min(3).max(40),
});
export const DriverProfile = DriverProfileBody.extend({ dailyPaidTrips: z.int().min(0) });

/** A driver's reusable journey setup (FR 3.1.1-3.1.6). */
export const PresetBody = z.object({
  name: z.string().trim().min(1).max(40),
  exitGateId: Id,
  plan: Plan,
  allowedPickupTypes: z.array(PickupType).min(1),
  detourToleranceMin: z.int().min(0).max(5),
  schedule: z
    .object({ days: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).min(1), departAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
    .nullable()
    .optional(),
  /** FR 3.1.6: the driver confirms these journeys happen regardless of passengers. Must be true to save. */
  exemptionConfirmed: z.literal(true),
});
export const Preset = PresetBody.extend({ id: Id, exemptionConfirmedAt: z.iso.datetime() });
export const PresetList = z.array(Preset);

export type RegisterBody = z.infer<typeof RegisterBody>;
export type LoginBody = z.infer<typeof LoginBody>;
export type Me = z.infer<typeof Me>;
export type PresetBody = z.infer<typeof PresetBody>;
export type Preset = z.infer<typeof Preset>;
