-- Vetting fix G5 / NA-001: a driver has at most ONE journey that is live or in progress.
-- JourneyService.goLive checks this first, but the check and the insert are separate statements, so three parallel
-- "Go live" taps all passed the check and created three journeys. This partial unique index makes the database the referee:
-- the second and third inserts fail with a unique violation, which goLive turns into ILLEGAL_STATE_TRANSITION.
-- If this migration fails on an existing database, a driver already has two active journeys: cancel the extra ones first.
CREATE UNIQUE INDEX "Journey_one_active_per_driver" ON "Journey"("driverId") WHERE "status" IN ('LIVE', 'OPEN', 'FULL', 'IN_PROGRESS');
