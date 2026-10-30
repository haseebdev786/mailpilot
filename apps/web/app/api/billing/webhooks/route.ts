import { NextResponse } from "next/server";
import { handleStripeWebhook, verifyStripeWebhookSignature } from "@mailpilot/shared/billing";
import { logger } from "@mailpilot/shared/logger";

// Stripe requires the raw body for signature verification; do not parse JSON first.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  try {
    const result = await handleStripeWebhook(event);
    return NextResponse.json({ received: true, handled: result.handled });
  } catch (error) {
    logger.error("stripe_webhook_failed", { type: event.type, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
