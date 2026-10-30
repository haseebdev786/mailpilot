-- Additive Phase 2 mailbox controls
CREATE TYPE "MailboxHealthStatus" AS ENUM ('UNKNOWN', 'CONNECTED', 'ERROR');

ALTER TABLE "Mailbox"
  ADD COLUMN "signature" TEXT,
  ADD COLUMN "businessAddress" TEXT,
  ADD COLUMN "dailySendLimit" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "warmupEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "warmupStartPerDay" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "warmupRampPerDay" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "warmupDay" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "healthStatus" "MailboxHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "healthError" TEXT,
  ADD COLUMN "lastTestedAt" TIMESTAMP(3);
