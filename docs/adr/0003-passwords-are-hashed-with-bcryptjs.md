# ADR 0003: Passwords are hashed with bcryptjs

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

Passwords must never be stored or logged in the clear (NFR-2.2). The native `bcrypt` needs a compiler on every student's machine.

## Decision

Use `bcryptjs` (pure JavaScript), cost 10. A login for an unknown e-mail compares against a dummy hash, so a wrong e-mail takes as long as a wrong password.

## Consequences

Slightly slower than native bcrypt, which does not matter at this scale. Verification codes are different: they are stored as an HMAC and expire in 10 minutes.
