# ADR 0002: Login session is a JWT in an httpOnly cookie

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

The API and the WebSocket both need to know who is calling. A token in localStorage can be read by any script that gets onto the page.

## Decision

On login the server signs a JWT (HS256, 7 days) and sets it in an `httpOnly`, `SameSite` cookie (`Secure` in production). The same cookie authenticates the Socket.IO handshake. The roles inside the token are advisory: every request re-reads the user, so a stale token cannot grant a role the user no longer holds.

## Consequences

No token handling in the client code. Logging out clears the cookie. With the client and API on different origins the cookie needs `SameSite=None; Secure` and an exact CORS origin, so the demo serves both from one origin.
