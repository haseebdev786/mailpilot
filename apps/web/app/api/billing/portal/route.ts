import { NextResponse } from "next/server";
import { createPortalSession, getWorkspaceEntitlement, isStripeConfigured } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  const entitlement = await getWorkspaceEntitlement(auth.workspace.id);
  if (!entitlement.providerCustomerId) return NextResponse.json({ error: "No Stripe customer exists yet. Start checkout first." }, { status: 400 });
  try {
    const base = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    const session = await createPortalSession(entitlement.providerCustomerId, `${base}/billing`);
    if (!session.url) return NextResponse.json({ error: "Stripe did not return a portal URL." }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to open the billing portal." }, { status: 502 });
  }
}
