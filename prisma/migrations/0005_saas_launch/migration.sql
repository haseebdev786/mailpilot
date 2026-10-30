CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
ALTER TABLE "Plan" ADD COLUMN "stripePriceIdMonthly" TEXT, ADD COLUMN "stripePriceIdYearly" TEXT, ADD COLUMN "monthlySendLimit" INTEGER NOT NULL DEFAULT 200, ADD COLUMN "monthlyAiCalls" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3), ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mailbox" ADD COLUMN "oauthAccessTokenEncrypted" TEXT, ADD COLUMN "oauthTokenExpiresAt" TIMESTAMP(3), ADD COLUMN "oauthScope" TEXT, ADD COLUMN "imapUidValidity" TEXT;
CREATE TABLE "AuthToken" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" "AuthTokenType" NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_type_expiresAt_idx" ON "AuthToken"("userId", "type", "expiresAt");
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "AiUsage" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "provider" TEXT NOT NULL, "model" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AiUsage_workspaceId_createdAt_idx" ON "AiUsage"("workspaceId", "createdAt");
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "FailedJob" ("id" TEXT NOT NULL, "queue" TEXT NOT NULL DEFAULT 'outreach', "jobId" TEXT, "jobName" TEXT NOT NULL, "workspaceId" TEXT, "payload" JSONB, "error" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FailedJob_pkey" PRIMARY KEY ("id"));
CREATE INDEX "FailedJob_workspaceId_failedAt_idx" ON "FailedJob"("workspaceId", "failedAt");
CREATE INDEX "FailedJob_jobName_failedAt_idx" ON "FailedJob"("jobName", "failedAt");
-- Seed the paid tiers (Stripe price ids stay NULL until the operator sets STRIPE_PRICE_* and re-runs ensurePlans via signup/billing).
INSERT INTO "Plan" ("id", "code", "name", "description", "monthlyPrice", "maxMailboxes", "maxContacts", "maxActiveCampaigns", "monthlySendLimit", "monthlyAiCalls", "createdAt", "updatedAt")
VALUES ('plan-pro-seed', 'pro', 'Pro', 'For growing outreach', 2900, 5, 10000, 5, 5000, 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Plan" ("id", "code", "name", "description", "monthlyPrice", "maxMailboxes", "maxContacts", "maxActiveCampaigns", "monthlySendLimit", "monthlyAiCalls", "createdAt", "updatedAt")
VALUES ('plan-scale-seed', 'scale', 'Scale', 'For teams sending at volume', 9900, 20, 50000, 20, 25000, 5000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
