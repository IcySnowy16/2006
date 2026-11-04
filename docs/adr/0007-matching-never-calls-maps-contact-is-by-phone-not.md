# ADR 0007: Matching never calls Maps; contact is by phone, not chat

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

Maps calls cost money and time; free-text chat needs moderation and storage the team cannot afford.

## Decision

The driver's route is requested once, at go-live, and stored. Matching measures the detour as twice the shortest distance from the pickup point to that stored route at 20 km/h, using stored walking distances. Passengers and drivers reach each other by phone: the number is shown only to a confirmed participant, inside a 30-minute window.

## Consequences

The detour is an estimate, which is enough on a campus. There is no message history and no quick-message feature. If a user does not want a call there is no in-app fallback (SRS Q17 and the contact feature remain open to change).
