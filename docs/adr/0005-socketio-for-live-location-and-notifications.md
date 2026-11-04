# ADR 0005: Socket.IO for live location and notifications

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

A passenger needs the driver's position about every 5 seconds and in-app notifications without refreshing (SRS Q14).

## Decision

Socket.IO (WebSocket with fallback). A socket needs the login cookie. A journey room is joined only after the server checks the caller is the driver or a CONFIRMED passenger of an IN_PROGRESS journey. Positions are throttled to one per second, stored, and deleted 30 seconds after the trip ends.

## Consequences

The host must pass WebSocket through its proxy (checked in task F14). One server process in v1, so rooms live in memory; scaling out later needs the Socket.IO Redis adapter.
