# ADR 0008: Campus coordinates come from a reviewed file only

**Status:** accepted (default used by the code; change it by writing a new record).

## Context

A wrong pin sends a driver to the wrong place, and the geofence cancels journeys using the campus boundary.

## Decision

The catalog template holds names only. A script asks Google Geocoding for candidates; a person checks each place on a map and marks it reviewed; the seed writes only reviewed places. The campus boundary polygon is a file named by `CAMPUS_BOUNDARY`; with none, the geofence is off.

## Consequences

Until the team does that review, the real catalog is empty and the app can only be tried with the labelled `[DEMO]` synthetic data.
