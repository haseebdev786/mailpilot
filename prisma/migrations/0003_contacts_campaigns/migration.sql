-- Contact import, tags, and campaign execution
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Contact" ADD COLUMN "website" TEXT;
ALTER TABLE "Campaign"
  ADD COLUMN "businessDescription" TEXT,
  ADD COLUMN "services" TEXT,
  ADD COLUMN "offer" TEXT,
  ADD COLUMN "tone" TEXT,
  ADD COLUMN "cta" TEXT,
  ADD COLUMN "signature" TEXT,
  ADD COLUMN "sendingDelayMin" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "sendingDelayMax" INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN "sendingStartHour" INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "sendingEndHour" INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "skipWeekends" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "launchedAt" TIMESTAMP(3);
ALTER TABLE "CampaignContact"
  ADD COLUMN "generatedSubject" TEXT,
  ADD COLUMN "generatedText" TEXT,
  ADD COLUMN "generatedHtml" TEXT,
  ADD COLUMN "generatedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

CREATE TABLE "CampaignMailbox" (
  "campaignId" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CampaignMailbox_pkey" PRIMARY KEY ("campaignId", "mailboxId")
);
CREATE INDEX "CampaignMailbox_mailboxId_idx" ON "CampaignMailbox"("mailboxId");
ALTER TABLE "CampaignMailbox" ADD CONSTRAINT "CampaignMailbox_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignMailbox" ADD CONSTRAINT "CampaignMailbox_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContactTag" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'mint',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactTag_workspaceId_name_key" ON "ContactTag"("workspaceId", "name");
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContactTagAssignment" (
  "contactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactTagAssignment_pkey" PRIMARY KEY ("contactId", "tagId")
);
CREATE INDEX "ContactTagAssignment_tagId_idx" ON "ContactTagAssignment"("tagId");
ALTER TABLE "ContactTagAssignment" ADD CONSTRAINT "ContactTagAssignment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTagAssignment" ADD CONSTRAINT "ContactTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ContactTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "listId" TEXT,
  "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "fileName" TEXT NOT NULL,
  "total" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "valid" INTEGER NOT NULL DEFAULT 0,
  "invalid" INTEGER NOT NULL DEFAULT 0,
  "duplicates" INTEGER NOT NULL DEFAULT 0,
  "suppressed" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportJob_workspaceId_createdAt_idx" ON "ImportJob"("workspaceId", "createdAt");
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
