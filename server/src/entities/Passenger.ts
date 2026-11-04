/** Task F7a: the passenger side of a User (counters for the trust rule, FR 6.10, 10.3). */
import { type User } from './User';

export class Passenger {
  constructor(private readonly user: User) {}

  get completedRides(): number {
    return this.user.completedRides;
  }
  get unpaidCount(): number {
    return this.user.unpaidCount;
  }
  incrementCompletedRides(): void {
    this.user.incrementCompletedRides();
  }
  incrementUnpaidCount(): void {
    this.user.incrementUnpaidCount();
  }
  /** FR 10.3: needs 3 completed rides. The 75% balance test is WalletService's. */
  isEligibleForTrustBooking(): boolean {
    return this.user.isEligibleForTrustBooking();
  }
}
