# ADR 0001: Progressive web app, not a native app

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

Four students, one semester, and the demo must run on whatever phone the marker holds. Two native apps (iOS and Android) would double the work and need app-store accounts.

## Decision

Build one React web app as a PWA served over HTTPS: installable to the home screen, with an offline shell page. It uses the browser's geolocation and a screen wake lock during a trip.

## Consequences

Background location is not reliable in a browser, so the app keeps the screen on during a trip and says so (no promise of tracking in the background). Geolocation and the service worker need HTTPS, so phone testing needs a tunnel or the deployed preview. Web Push stays off until a real push provider is set up (`pushNotifications` flag).
