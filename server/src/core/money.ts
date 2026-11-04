/**
 * Task K3: money as whole cents. Floating point never touches a fare or a balance (NFR-3.3, FR 10.10).
 * Immutable: every operation returns a new Money.
 */
export class Money {
  private constructor(readonly cents: number) {}

  /** The only way in. Throws on a fraction, a negative number or NaN. */
  static cents(n: number): Money {
    if (!Number.isSafeInteger(n)) throw new RangeError(`Money must be a whole number of cents, got ${n}`);
    if (n < 0) throw new RangeError(`Money cannot be negative, got ${n}`);
    return new Money(n);
  }

  static zero(): Money {
    return new Money(0);
  }

  /** "3", "3.5", "3.50" or the number 3.5. At most two decimals; never goes through a float multiplication. */
  static fromDollars(input: number | string): Money {
    const text = typeof input === 'number' ? String(input) : input.trim();
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!m) throw new RangeError(`Not a dollar amount with at most two decimals: "${text}"`);
    return Money.cents(Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0'));
  }

  add(o: Money): Money {
    return Money.cents(this.cents + o.cents);
  }

  /** Throws if the result would be negative: a balance can never go below zero. */
  sub(o: Money): Money {
    return Money.cents(this.cents - o.cents);
  }

  /** `this * numerator / denominator`, rounded DOWN to a whole cent, using integers only. */
  mulFraction(numerator: number, denominator: number): Money {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0)
      throw new RangeError('mulFraction needs integers and a positive denominator');
    return Money.cents(Math.floor((this.cents * numerator) / denominator));
  }

  gt(o: Money): boolean {
    return this.cents > o.cents;
  }
  gte(o: Money): boolean {
    return this.cents >= o.cents;
  }
  lt(o: Money): boolean {
    return this.cents < o.cents;
  }
  lte(o: Money): boolean {
    return this.cents <= o.cents;
  }
  equals(o: Money): boolean {
    return this.cents === o.cents;
  }
  isZero(): boolean {
    return this.cents === 0;
  }

  static min(a: Money, b: Money): Money {
    return a.cents <= b.cents ? a : b;
  }

  /** "$3.00" */
  format(): string {
    return `$${Math.floor(this.cents / 100)}.${String(this.cents % 100).padStart(2, '0')}`;
  }

  toJSON(): number {
    return this.cents;
  }
}
