# ADR 0004: Prisma and PostgreSQL, with services using Prisma directly

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

The rules that must never break (seats between 0 and 3, a wallet never negative, one rating per booking and rater) need real transactions and constraints.

## Decision

PostgreSQL 16 with Prisma. Services call Prisma themselves (no repository layer: it would add a class per table and no safety). Conditions that must hold even if a service has a bug are also CHECK constraints and triggers in a hand-written migration. Seats and wallets are changed with `SELECT ... FOR UPDATE` plus conditional updates.

## Consequences

The entities stay free of Prisma (the dependency rule), so they are tested without a database; the integration tests run against a real Postgres in Docker. The Prisma CLI has a known advisory in a transitive dev dependency (deepmerge-ts); it is not part of the running server.
