# ADR 0006: Money is simulated, in integer cents

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

The project may not move real money (NFR-6.4), but the booking, hold and settlement logic must still be real and testable.

## Decision

A wallet per user with balance and held amount, a PayNow adapter that only pretends, and a ledger of every movement. Amounts are whole cents in code, database and API; screens say SIMULATED. A passenger with at least 75% of the fare and 3 completed rides may book on trust; an unpaid shortfall becomes a Debt and locks the account until it is paid.

## Consequences

No floating point touches money. The $100 cap, the $3 warning, the $2 minimum to ask for a ride and the no-fee choice are the defaults for SRS Q5 and are one line each in `shared/src/defaults.ts`. Booking on trust (75% of the fare and 3 rides) is still in the code but switched off by the `bookOnTrust` flag, so for now the whole fare must be in the wallet.
