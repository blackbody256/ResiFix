CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Ticket" ADD COLUMN "facilityId" TEXT;
ALTER TABLE "Ticket" ALTER COLUMN "roomId" DROP NOT NULL;

CREATE UNIQUE INDEX "Facility_propertyId_name_key" ON "Facility"("propertyId", "name");
CREATE INDEX "Facility_propertyId_idx" ON "Facility"("propertyId");
CREATE INDEX "AvailabilityWindow_userId_weekday_startMinute_idx" ON "AvailabilityWindow"("userId", "weekday", "startMinute");
CREATE INDEX "Ticket_facilityId_idx" ON "Ticket"("facilityId");
DROP INDEX "DuplicateLink_ticketId_canonicalId_key";
CREATE UNIQUE INDEX "DuplicateLink_ticketId_key" ON "DuplicateLink"("ticketId");
CREATE UNIQUE INDEX "DuplicateLink_canonicalId_linkedById_key" ON "DuplicateLink"("canonicalId", "linkedById");
CREATE INDEX "DuplicateLink_canonicalId_idx" ON "DuplicateLink"("canonicalId");

ALTER TABLE "Facility" ADD CONSTRAINT "Facility_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_exactly_one_target_check"
  CHECK (("roomId" IS NOT NULL AND "facilityId" IS NULL) OR ("roomId" IS NULL AND "facilityId" IS NOT NULL));
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_minute_range_check"
  CHECK ("startMinute" >= 0 AND "startMinute" < 1440 AND "endMinute" > 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");
