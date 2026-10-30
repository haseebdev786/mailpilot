import { NextResponse } from "next/server";
import { ensurePlans, getUsageSummary, getWorkspaceEntitlement, isStripeConfigured } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";

export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const plans = await ensurePlans();
  const entitlement = await getWorkspaceEntitlement(auth.workspace.id);
  const usage = await getUsageSummary(auth.workspace.id, entitlement.periodStart);
  return NextResponse.json({
    plan: entitlement.plan,
    subscriptionStatus: entitlement.subscriptionStatus,
    subscriptionActive: entitlement.subscriptionActive,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    hasStripeCustomer: Boolean(entitlement.providerCustomerId),
    usage,
    plans: Object.values(plans),
    stripeConfigured: isStripeConfigured()
  });
}
