/**
 * Task F7a: the account side of the domain. Plain TypeScript: no Express, no Prisma (the dependency rule, enforced by K10).
 * A record in, a record out: services map Prisma rows to these classes with `fromRecord` and back with `toRecord`.
 */
import bcrypt from 'bcryptjs';
import type { AccountStatus, ActiveRole } from '@campus-hop/shared';
import { DEFAULTS } from '@campus-hop/shared';
import { AppError } from '../errors/AppError';

export interface UserRecord {
  id: string;
  name: string;
  ntuEmail: string;
  phone: string;
  passwordHash: string;
  isDriver: boolean;
  isPassenger: boolean;
  lastActiveRole: ActiveRole | null;
  accountStatus: AccountStatus;
  pushEnabled: boolean;
  completedRides: number;
  unpaidCount: number;
  ratingSum: number;
  ratingCount: number;
}

export class User {
  private constructor(private rec: UserRecord) {}

  static fromRecord(rec: UserRecord): User {
    return new User({ ...rec });
  }

  toRecord(): UserRecord {
    return { ...this.rec };
  }

  get id(): string {
    return this.rec.id;
  }
  get accountStatus(): AccountStatus {
    return this.rec.accountStatus;
  }
  get roles(): ActiveRole[] {
    return [...(this.rec.isDriver ? (['DRIVER'] as const) : []), ...(this.rec.isPassenger ? (['PASSENGER'] as const) : [])];
  }
  get firstName(): string {
    return this.rec.name.trim().split(/\s+/)[0] ?? this.rec.name;
  }

  /** Average of the stars received, or null before the first rating. */
  get averageRating(): number | null {
    return this.rec.ratingCount === 0 ? null : Math.round((this.rec.ratingSum / this.rec.ratingCount) * 10) / 10;
  }

  holds(role: ActiveRole): boolean {
    return role === 'DRIVER' ? this.rec.isDriver : this.rec.isPassenger;
  }

  /** PENDING_VERIFICATION -> ACTIVE (FR 1.3). The code itself is checked by AuthService; this records the outcome. */
  verifyEmail(): void {
    if (this.rec.accountStatus !== 'PENDING_VERIFICATION') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'This account is already verified.' });
    this.rec.accountStatus = 'ACTIVE';
  }

  async checkPassword(plain: string): Promise<boolean> {
    return bcrypt.compare(plain, this.rec.passwordHash);
  }

  /** ACTIVE -> LOCKED. `accountStatus` changes only through lock and unlock (and verifyEmail). */
  lock(_reason: string): void {
    if (this.rec.accountStatus !== 'ACTIVE')
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: `A ${this.rec.accountStatus} account cannot be locked.` });
    this.rec.accountStatus = 'LOCKED';
  }

  unlock(): void {
    if (this.rec.accountStatus !== 'LOCKED') throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'Only a locked account can be unlocked.' });
    this.rec.accountStatus = 'ACTIVE';
  }

  addRole(role: ActiveRole): void {
    if (this.holds(role)) throw new AppError('CONFLICT', { message: `You already hold the ${role.toLowerCase()} role.` });
    if (role === 'DRIVER') this.rec.isDriver = true;
    else this.rec.isPassenger = true;
  }

  /** A user acts in one role at a time (FR 1.7). Choosing a role the user does not hold is FORBIDDEN. */
  chooseActiveRole(role: ActiveRole): void {
    if (!this.holds(role)) throw new AppError('FORBIDDEN', { message: `You do not hold the ${role.toLowerCase()} role.` });
    this.rec.lastActiveRole = role;
  }

  /** One star rating received (FR 9.1). */
  recordRating(stars: number): void {
    this.rec.ratingSum += stars;
    this.rec.ratingCount += 1;
  }

  // ---- passenger counters (Passenger in the design model) -------------------------------------
  get completedRides(): number {
    return this.rec.completedRides;
  }
  get unpaidCount(): number {
    return this.rec.unpaidCount;
  }
  incrementCompletedRides(): void {
    this.rec.completedRides += 1;
  }
  incrementUnpaidCount(): void {
    this.rec.unpaidCount += 1;
  }
  /** FR 10.3: a passenger with 3 completed rides may book on trust. The 75% balance test lives in WalletService. */
  isEligibleForTrustBooking(): boolean {
    return this.rec.completedRides >= DEFAULTS.TRUST_MIN_COMPLETED_RIDES;
  }
}
