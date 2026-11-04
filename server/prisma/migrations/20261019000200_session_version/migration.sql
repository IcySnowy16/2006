-- Sign-out everywhere (review finding): every session token carries the user's sessionVersion; signing out bumps it, so a copied
-- or stolen cookie stops working at once instead of living out its 7 days.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- A passenger can withdraw an open hop request (review finding: with one open request allowed, a request for tonight blocked any
-- ride "now" for hours).
ALTER TYPE "HopRequestStatus" ADD VALUE 'CANCELLED';
