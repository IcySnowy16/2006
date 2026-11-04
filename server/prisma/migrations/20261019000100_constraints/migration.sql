-- Task F5: rules that must hold even if a service has a bug (second line of defence; NFR-3.1, NFR-3.3, FR 10.10).
-- Written by hand after the generated "init" migration, because Prisma cannot express CHECK constraints.

-- Seats are 0..3 (SHARING cap, SRS Q4 default).
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_seats_check" CHECK ("seatsAvailable" >= 0 AND "seatsAvailable" <= 3);

-- A wallet can never go negative, and what is held can never exceed what is there.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_money_check" CHECK ("balanceCents" >= 0 AND "heldCents" >= 0 AND "heldCents" <= "balanceCents");

-- Money columns are never negative.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_money_check" CHECK ("currentFareCents" >= 0 AND "heldCents" >= 0 AND ("finalFareCents" IS NULL OR "finalFareCents" >= 0));
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_amount_check" CHECK ("amountCents" > 0);
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_amount_check" CHECK ("amountCents" > 0);

-- Ratings are 1 to 5 stars (FR 9.1); the unique (booking, rater) pair is in the schema.
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_stars_check" CHECK ("stars" BETWEEN 1 AND 5);

-- The fare table: 1 to 3 riders, a positive fare (FR 5.1).
ALTER TABLE "FareTier" ADD CONSTRAINT "FareTier_check" CHECK ("riders" BETWEEN 1 AND 3 AND "perRiderCents" > 0);

ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_trips_check" CHECK ("dailyPaidTrips" >= 0);

-- Append-only tables: the ledger and the location trail can be inserted into, never changed (FR 10.10).
CREATE FUNCTION "forbid_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletTransaction_append_only" BEFORE UPDATE OR DELETE ON "WalletTransaction" FOR EACH ROW EXECUTE FUNCTION "forbid_change"();
CREATE TRIGGER "LocationUpdate_append_only" BEFORE UPDATE ON "LocationUpdate" FOR EACH ROW EXECUTE FUNCTION "forbid_change"();
