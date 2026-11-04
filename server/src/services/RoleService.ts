/**
 * Task A6: which role the user acts in (driver or passenger), and adding the passenger role.
 *
 *  - Roles HELD are set at registration (FR 1.5). The role ACTED IN is the session's activeRole (FR 1.7).
 *  - Switching is refused mid-trip: as a driver with a journey LIVE, OPEN, FULL or IN_PROGRESS, or as a passenger with a
 *    CONFIRMED booking on a journey that is OPEN, FULL or IN_PROGRESS (ILLEGAL_STATE_TRANSITION). So a role switch can never
 *    break a trip in progress (UC-2.EX.2).
 *  - A driver-only user can gain the passenger role. A passenger becomes a driver by saving vehicle details (UC-3, task B1).
 */
import type { ActiveRole, Me } from '@campus-hop/shared';
import type { AppContext } from '../context';
import { AppError } from '../errors/AppError';
import { User, type UserRecord } from '../entities/User';
import { signSession } from '../auth/session';
import { AuthService } from './AuthService';

export class RoleService {
  private readonly auth: AuthService;

  constructor(private readonly ctx: AppContext) {
    this.auth = new AuthService(ctx);
  }

  /** True while the user is on a trip in either role. */
  async isMidTrip(userId: string): Promise<boolean> {
    const db = this.ctx.db();
    const asDriver = await db.journey.count({ where: { driverId: userId, status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } });
    if (asDriver > 0) return true;
    const asPassenger = await db.booking.count({
      // PENDING counts too: the driver may accept it after the switch, and the user would then be riding and driving at once.
      where: { passengerId: userId, status: { in: ['PENDING', 'CONFIRMED'] }, journey: { status: { in: ['LIVE', 'OPEN', 'FULL', 'IN_PROGRESS'] } } },
    });
    return asPassenger > 0;
  }

  async setActiveRole(userId: string, role: ActiveRole, current: ActiveRole | null): Promise<{ token: string; me: Me }> {
    const db = this.ctx.db();
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const user = User.fromRecord(row as UserRecord);
    user.chooseActiveRole(role); // FORBIDDEN if the role is not held
    if (current !== role && (await this.isMidTrip(userId))) {
      throw new AppError('ILLEGAL_STATE_TRANSITION', { message: 'Finish or cancel your trip first, then switch role.' });
    }
    await db.user.update({ where: { id: userId }, data: { lastActiveRole: role } });
    const token = signSession({ sub: userId, roles: user.roles, activeRole: role, sv: row.sessionVersion }, this.ctx.config, this.ctx.clock);
    return { token, me: await this.auth.me(userId, role) };
  }

  /** POST /api/me/roles { add: 'PASSENGER' }. The wallet already exists (every user has one). */
  async addPassengerRole(userId: string, current: ActiveRole | null): Promise<{ token: string; me: Me }> {
    const db = this.ctx.db();
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const user = User.fromRecord(row as UserRecord);
    user.addRole('PASSENGER'); // CONFLICT if already held
    await db.user.update({ where: { id: userId }, data: { isPassenger: true } });
    const token = signSession({ sub: userId, roles: user.roles, activeRole: current, sv: row.sessionVersion }, this.ctx.config, this.ctx.clock);
    return { token, me: await this.auth.me(userId, current) };
  }
}
