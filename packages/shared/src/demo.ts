import { prisma } from "./db";
import { hashPassword } from "./auth";

/**
 * Demo account used for local testing.
 * The password is intentionally simple and only works when demo login is enabled.
 */
export const DEMO_EMAIL = "demo@mailpilot.dev";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_NAME = "Demo Pilot";

/** Demo login is available in development, or anywhere DEMO_LOGIN_ENABLED=true. */
export function isDemoLoginEnabled(): boolean {
  if (process.env.DEMO_LOGIN_ENABLED === "false") return false;
  if (process.env.DEMO_LOGIN_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Creates (or repairs) the demo user, workspace, membership, plan and subscription.
 * Safe to call repeatedly, so both the seed script and the demo login route can use it.
 */
export async function ensureDemoAccount() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME, passwordHash, emailVerifiedAt: new Date() },
    create: {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      passwordHash,
      emailVerifiedAt: new Date()
    }
  });

  let workspace = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" }
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Demo Workspace",
        slug: "demo-workspace",
        ownerId: user.id
      }
    });
  }

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: user.id, role: "OWNER" }
  });

  const plan = await prisma.plan.upsert({
    where: { code: "free" },
    update: {},
    create: {
      code: "free",
      name: "Free",
      description: "A focused starting point for testing outreach",
      maxMailboxes: 1,
      maxContacts: 1000,
      maxActiveCampaigns: 1
    }
  });

  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: { workspaceId: workspace.id, planId: plan.id, status: "TRIALING" }
  });

  return { user, workspace };
}
