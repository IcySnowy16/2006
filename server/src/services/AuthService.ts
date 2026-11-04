/**
 * Tasks A2 and A6 (me): registration, e-mail verification, login and "who am I".
 *
 * UC-1 Register & Verify NTU Email, UC-2 Login. Exceptions raised: UC-1.EX.1 EMAIL_DOMAIN_NOT_ALLOWED, UC-1.AC.1 EMAIL_TAKEN,
 * UC-1.EX.2 VERIFICATION_CODE_INVALID then CODE_ATTEMPTS_EXCEEDED, UC-2.EX.1 INVALID_CREDENTIALS, FR 1.3 EMAIL_NOT_VERIFIED.
 *
 * Rules kept here (NFR-2.1, NFR-2.2, NFR-5.2):
 *  - the verification code is stored as an HMAC (never the code), expires after 10 minutes and allows 3 attempts;
 *  - passwords are stored as bcrypt hashes; a wrong e-mail and a wrong password give the same error and take the same time;
 *  - nothing returned to a client contains the password hash, the code, or another user's e-mail.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { ActiveRole, Me, RoleHeld } from '@campus-hop/shared';
import { type Account, DEFAULTS } from '@campus-hop/shared';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { addMs, minutes } from '../core/clock';
import { AppError } from '../errors/AppError';
import { User, type UserRecord } from '../entities/User';
import { verificationEmail } from '../adapters/email/templates';
import { signSession } from '../auth/session';

export const NTU_DOMAINS = ['@e.ntu.edu.sg', '@ntu.edu.sg'] as const;
const BCRYPT_COST = 10;
/** Compared against when the e-mail is unknown, so a wrong e-mail takes as long as a wrong password. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export class AuthService {
  constructor(private readonly ctx: AppContext) {}

  private hashCode(userId: string, code: string): string {
    return createHmac('sha256', this.ctx.config.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
  }

  /** FR 1.1: only an NTU address. */
  static isNtuEmail(email: string): boolean {
    return NTU_DOMAINS.some((d) => email.endsWith(d));
  }

  async register(body: z.output<typeof Account.RegisterBody>): Promise<{ userId: string }> {
    if (!AuthService.isNtuEmail(body.ntuEmail)) throw new AppError('EMAIL_DOMAIN_NOT_ALLOWED');
    const db = this.ctx.db();
    if (await db.user.findUnique({ where: { ntuEmail: body.ntuEmail }, select: { id: true } })) throw new AppError('EMAIL_TAKEN');
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    const user = await db.user.create({
      data: {
        name: body.name,
        ntuEmail: body.ntuEmail,
        phone: body.phone,
        passwordHash,
        // FR 1.5: the roles held. The vehicle details come later, in Manage Profile (UC-3, task B1).
        isDriver: body.role === 'DRIVER' || body.role === 'BOTH',
        isPassenger: body.role === 'PASSENGER' || body.role === 'BOTH',
        accountStatus: 'PENDING_VERIFICATION',
        wallet: { create: {} }, // every user has a wallet (balance 0)
      },
    });
    await this.issueCode(user.id, user.ntuEmail);
    return { userId: user.id };
  }

  /** Create a fresh code (the old ones stop working) and e-mail it. A mail failure is EXTERNAL_SERVICE_UNAVAILABLE: ask the user to retry. */
  private async issueCode(userId: string, email: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = this.ctx.clock.now();
    const db = this.ctx.db();
    await db.emailVerification.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now } });
    await db.emailVerification.create({ data: { userId, codeHash: this.hashCode(userId, code), expiresAt: addMs(now, minutes(DEFAULTS.CODE_TTL_MIN)) } });
    const mail = verificationEmail(code, DEFAULTS.CODE_TTL_MIN);
    await this.ctx.adapters.email.send({ to: email, subject: mail.subject, body: mail.body });
  }

  async verify(ntuEmail: string, code: string): Promise<void> {
    const db = this.ctx.db();
    const user = await db.user.findUnique({ where: { ntuEmail } });
    if (!user) throw new AppError('NOT_FOUND');
    if (user.accountStatus !== 'PENDING_VERIFICATION') return; // already verified: nothing to do
    const row = await db.emailVerification.findFirst({ where: { userId: user.id, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    const now = this.ctx.clock.now();
    if (!row || row.expiresAt.getTime() < now.getTime())
      throw new AppError('VERIFICATION_CODE_INVALID', { message: 'That code has expired. Ask for a new one.' });
    if (row.attempts >= DEFAULTS.CODE_MAX_ATTEMPTS) throw new AppError('CODE_ATTEMPTS_EXCEEDED');

    // Spend the attempt BEFORE comparing, in one conditional update: guesses sent in parallel cannot all read "0 attempts used".
    const spent = await db.emailVerification.updateMany({
      where: { id: row.id, attempts: { lt: DEFAULTS.CODE_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (spent.count === 0) throw new AppError('CODE_ATTEMPTS_EXCEEDED');

    const expected = Buffer.from(row.codeHash, 'hex');
    const given = Buffer.from(this.hashCode(user.id, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new AppError(row.attempts + 1 >= DEFAULTS.CODE_MAX_ATTEMPTS ? 'CODE_ATTEMPTS_EXCEEDED' : 'VERIFICATION_CODE_INVALID');
    }
    const entity = User.fromRecord(user as UserRecord);
    entity.verifyEmail();
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { accountStatus: entity.accountStatus } }),
      db.emailVerification.update({ where: { id: row.id }, data: { consumedAt: now } }),
    ]);
  }

  async resend(ntuEmail: string): Promise<void> {
    const user = await this.ctx.db().user.findUnique({ where: { ntuEmail } });
    if (!user) throw new AppError('NOT_FOUND');
    if (user.accountStatus !== 'PENDING_VERIFICATION') return;
    await this.issueCode(user.id, user.ntuEmail);
  }

  /**
   * UC-2. Returns the signed session and the "me" answer. A user holding one role acts in it; a user holding both acts in the
   * remembered one, or none yet (the client shows Choose Role).
   */
  async login(ntuEmail: string, password: string): Promise<{ token: string; me: Me }> {
    const user = await this.ctx.db().user.findUnique({ where: { ntuEmail } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError('INVALID_CREDENTIALS');
    if (user.accountStatus === 'PENDING_VERIFICATION') throw new AppError('EMAIL_NOT_VERIFIED');
    const entity = User.fromRecord(user as UserRecord);
    const roles = entity.roles;
    const activeRole: ActiveRole | null =
      roles.length === 1 ? (roles[0] ?? null) : user.lastActiveRole && roles.includes(user.lastActiveRole) ? user.lastActiveRole : null;
    const token = signSession({ sub: user.id, roles, activeRole, sv: user.sessionVersion }, this.ctx.config, this.ctx.clock);
    return { token, me: await this.me(user.id, activeRole) };
  }

  /** The signed-in user's own summary (never the hash, the code or anyone else's e-mail). */
  /** Sign-out ends every session of this user: tokens carry the sessionVersion they were issued with. */
  async signOutEverywhere(userId: string): Promise<void> {
    await this.ctx.db().user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  }

  async me(userId: string, activeRole: ActiveRole | null): Promise<Me> {
    const user = await this.ctx.db().user.findUniqueOrThrow({ where: { id: userId }, include: { wallet: true, driverProfile: { select: { userId: true } } } });
    const roles: ActiveRole[] = [...(user.isDriver ? (['DRIVER'] as const) : []), ...(user.isPassenger ? (['PASSENGER'] as const) : [])];
    return {
      id: user.id,
      name: user.name,
      roles,
      activeRole,
      accountStatus: user.accountStatus,
      wallet: { balanceCents: user.wallet?.balanceCents ?? 0, heldCents: user.wallet?.heldCents ?? 0 },
      hasDriverProfile: user.driverProfile !== null,
    };
  }
}

export type { RoleHeld };
