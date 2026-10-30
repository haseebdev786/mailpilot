import crypto from "node:crypto";

export type PlanLimits = {
  code: string;
  name: string;
  monthlyPrice: number;
  maxMailboxes: number;
  maxContacts: number;
  maxActiveCampaigns: number;
  monthlySendLimit: number;
  monthlyAiCalls: number;
};

export const PLAN_DEFAULTS: Record<string, PlanLimits> = {
  free: { code: "free", name: "Free", monthlyPrice: 0, maxMailboxes: 1, maxContacts: 1000, maxActiveCampaigns: 1, monthlySendLimit: 200, monthlyAiCalls: 50 },
  pro: { code: "pro", name: "Pro", monthlyPrice: 2900, maxMailboxes: 5, maxContacts: 10000, maxActiveCampaigns: 5, monthlySendLimit: 5000, monthlyAiCalls: 1000 },
  scale: { code: "scale", name: "Scale", monthlyPrice: 9900, maxMailboxes: 20, maxContacts: 50000, maxActiveCampaigns: 20, monthlySendLimit: 25000, monthlyAiCalls: 5000 }
};

export function stripePriceId(planCode: string, interval: "MONTH" | "YEAR"): string | undefined {
  if (planCode === "pro") return interval === "MONTH" ? process.env.STRIPE_PRICE_PRO_MONTHLY : process.env.STRIPE_PRICE_PRO_YEARLY;
  if (planCode === "scale") return interval === "MONTH" ? process.env.STRIPE_PRICE_SCALE_MONTHLY : process.env.STRIPE_PRICE_SCALE_YEARLY;
  return undefined;
}

/** Stripe webhook signature verification (HMAC-SHA256, 5-minute tolerance). Pure: no database access. */
export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string | null, secret?: string): boolean {
  const webhookSecret = secret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => { const [key, value] = part.split("="); return [key, value]; }));
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function mapStripeStatus(status: string): "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" {
  if (status === "active") return "ACTIVE";
  if (status === "trialing") return "TRIALING";
  if (status === "past_due") return "PAST_DUE";
  if (status === "incomplete") return "INCOMPLETE";
  return "CANCELED";
}
