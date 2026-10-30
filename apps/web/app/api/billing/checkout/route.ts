import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutSession, getWorkspaceEntitlement, isStripeConfigured } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";

const schema = z.object({ planCode: z.enum(["pro", "scale"]), interval: z.enum(["MONTH", "YEAR"]).default("MONTH") });

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });
  if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY and the STRIPE_PRICE_* variables first." }, { status: 503 });
  try {
    const entitlement = await getWorkspaceEntitlement(auth.workspace.id);
    const base = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    const session = await createCheckoutSession({
      workspaceId: auth.workspace.id,
      planCode: parsed.data.planCode,
      interval: parsed.data.interval,
      customerId: entitlement.providerCustomerId,
      successUrl: `${base}/billing?checkout=success`,
      cancelUrl: `${base}/billing?checkout=cancelled`
    });
    if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start checkout." }, { status: 502 });
  }
}
