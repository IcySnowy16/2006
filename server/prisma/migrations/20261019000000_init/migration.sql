-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ActiveRole" AS ENUM ('DRIVER', 'PASSENGER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('SOLO', 'SHARING');

-- CreateEnum
CREATE TYPE "PickupType" AS ENUM ('BUS_STOP', 'CARPARK');

-- CreateEnum
CREATE TYPE "LocationZone" AS ENUM ('HALLS', 'ACADEMIC', 'GATE');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('LIVE', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('DRIVER', 'GEOFENCE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HopRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('WAITING', 'APPROACHING', 'ARRIVED', 'PICKED_UP', 'DROPPED_OFF', 'NO_SHOW', 'UNPAID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('HELD', 'PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOP_UP', 'HOLD', 'RELEASE', 'DEDUCT', 'CREDIT', 'PAYOUT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_REQUEST', 'BOOKING_CONFIRMED', 'BOOKING_DECLINED', 'JOURNEY_CANCELLED', 'JOURNEY_EXPIRED', 'GEOFENCE_CANCELLED', 'FARE_CHANGED', 'TRIP_STARTED', 'DRIVER_APPROACHING', 'DRIVER_ARRIVED', 'NO_SHOW', 'TRIP_COMPLETED', 'WALLET_CHECK', 'DEBT_RECORDED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'REQUEST_ACCEPTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ntuEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isDriver" BOOLEAN NOT NULL DEFAULT false,
    "isPassenger" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveRole" "ActiveRole",
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "completedRides" INTEGER NOT NULL DEFAULT 0,
    "unpaidCount" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "userId" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "payNowId" TEXT NOT NULL,
    "dailyPaidTrips" INTEGER NOT NULL DEFAULT 0,
    "lastPaidTripDate" TEXT,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" "LocationZone" NOT NULL,
    "isExit" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CampusLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupPoint" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "PickupType" NOT NULL,
    "walkDistanceM" DOUBLE PRECISION NOT NULL,
    "accessNote" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FareTier" (
    "riders" INTEGER NOT NULL,
    "perRiderCents" INTEGER NOT NULL,

    CONSTRAINT "FareTier_pkey" PRIMARY KEY ("riders")
);

-- CreateTable
CREATE TABLE "DriverPreset" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exitGateId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "allowedPickupTypes" "PickupType"[],
    "detourToleranceMin" INTEGER NOT NULL,
    "scheduleDays" TEXT[],
    "scheduleDepartAt" TEXT,
    "exemptionConfirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "presetId" TEXT,
    "status" "JourneyStatus" NOT NULL DEFAULT 'LIVE',
    "cancelReason" "CancelReason",
    "plan" "Plan" NOT NULL,
    "seatsAvailable" INTEGER NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "liveExpiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outsideReadings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "journeyId" TEXT NOT NULL,
    "polyline" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "distanceM" INTEGER NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("journeyId")
);

-- CreateTable
CREATE TABLE "LocationUpdate" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HopRequest" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "requestedTime" TIMESTAMP(3) NOT NULL,
    "status" "HopRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HopRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "hopRequestId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "pickupStatus" "PickupStatus" NOT NULL DEFAULT 'WAITING',
    "paymentStatus" "PaymentStatus",
    "bookedOnTrust" BOOLEAN NOT NULL DEFAULT false,
    "currentFareCents" INTEGER NOT NULL,
    "finalFareCents" INTEGER,
    "heldCents" INTEGER NOT NULL DEFAULT 0,
    "pickupPointId" TEXT NOT NULL,
    "dropoffPointId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "heldCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletUserId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "bookingId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_ntuEmail_key" ON "User"("ntuEmail");

-- CreateIndex
CREATE INDEX "EmailVerification_userId_createdAt_idx" ON "EmailVerification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampusLocation_name_key" ON "CampusLocation"("name");

-- CreateIndex
CREATE INDEX "DriverPreset_driverId_idx" ON "DriverPreset"("driverId");

-- CreateIndex
CREATE INDEX "Journey_status_departureTime_idx" ON "Journey"("status", "departureTime");

-- CreateIndex
CREATE INDEX "Journey_driverId_status_idx" ON "Journey"("driverId", "status");

-- CreateIndex
CREATE INDEX "LocationUpdate_journeyId_timestamp_idx" ON "LocationUpdate"("journeyId", "timestamp");

-- CreateIndex
CREATE INDEX "HopRequest_status_requestedTime_idx" ON "HopRequest"("status", "requestedTime");

-- CreateIndex
CREATE INDEX "HopRequest_passengerId_idx" ON "HopRequest"("passengerId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_hopRequestId_key" ON "Booking"("hopRequestId");

-- CreateIndex
CREATE INDEX "Booking_journeyId_status_idx" ON "Booking"("journeyId", "status");

-- CreateIndex
CREATE INDEX "Booking_passengerId_status_idx" ON "Booking"("passengerId", "status");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletUserId_timestamp_idx" ON "WalletTransaction"("walletUserId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_bookingId_key" ON "Debt"("bookingId");

-- CreateIndex
CREATE INDEX "Debt_userId_clearedAt_idx" ON "Debt"("userId", "clearedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_bookingId_raterId_key" ON "Rating"("bookingId", "raterId");

-- CreateIndex
CREATE INDEX "Notification_userId_timestamp_idx" ON "Notification"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CampusLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPreset" ADD CONSTRAINT "DriverPreset_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPreset" ADD CONSTRAINT "DriverPreset_exitGateId_fkey" FOREIGN KEY ("exitGateId") REFERENCES "CampusLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "DriverPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationUpdate" ADD CONSTRAINT "LocationUpdate_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopRequest" ADD CONSTRAINT "HopRequest_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopRequest" ADD CONSTRAINT "HopRequest_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "CampusLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopRequest" ADD CONSTRAINT "HopRequest_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "CampusLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hopRequestId_fkey" FOREIGN KEY ("hopRequestId") REFERENCES "HopRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_dropoffPointId_fkey" FOREIGN KEY ("dropoffPointId") REFERENCES "PickupPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletUserId_fkey" FOREIGN KEY ("walletUserId") REFERENCES "Wallet"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

