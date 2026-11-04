/**
 * Task K5 / C2: PayNow, SIMULATED. No real money moves anywhere in v1 (FR 10.11, NFR-6.4): this adapter only returns a
 * reference number so the screens can show something. The real PayNow is behind a licensed provider (backlog, SRS Q15).
 */
export interface PayNowReceipt {
  reference: string;
  simulated: true;
}

export interface PayNowAdapter {
  simulateTopUp(userId: string, cents: number): Promise<PayNowReceipt>;
  simulatePayout(userId: string, cents: number): Promise<PayNowReceipt>;
}

/** The adapter used in every environment for now. */
export class SimulatedPayNowAdapter implements PayNowAdapter {
  private n = 0;

  async simulateTopUp(_userId: string, _cents: number): Promise<PayNowReceipt> {
    return { reference: `SIM-TOPUP-${Date.now().toString(36)}-${++this.n}`, simulated: true };
  }

  async simulatePayout(_userId: string, _cents: number): Promise<PayNowReceipt> {
    return { reference: `SIM-PAYOUT-${Date.now().toString(36)}-${++this.n}`, simulated: true };
  }
}
