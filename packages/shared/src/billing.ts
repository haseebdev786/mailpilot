import { prisma } from "./db";
import { PLAN_DEFAULTS, mapStripeStatus, stripePriceId, verifyStripeWebhookSignature, type PlanLimits } from "./billing-plans";
export { PLAN_DEFAULTS, stripePriceId, verifyStripeWebhookSignature, mapStripeStatus, type PlanLimits } from "./billing-plans";
import { logger } from "./logger";



export async function ensurePlans() {
  const results: Record<string, PlanLimits> = {};
  for (const defaults of Object.values(PLAN_DEFAULTS)) {
    const plan = await prisma.plan.upsert({
      where: { code: defaults.code },
      update: {
        name: defaults.name,
        monthlyPrice: defaults.monthlyPrice,
        maxMailboxes: defaults.maxMailboxes,
        maxContacts: defaults.maxContacts,
        maxActiveCampaigns: defaults.maxActiveCampaigns,
        monthlySendLimit: defaults.monthlySendLimit,
        monthlyAiCalls: defaults.monthlyAiCalls,
        stripePriceIdMonthly: stripePriceId(defaults.code, "MONTH") ?? undefined,
        stripePriceIdYearly: stripePriceId(defaults.code, "YEAR") ?? undefined
      },
      create: {
        code: defaults.code,
        name: defaults.name,
        description: defaults.code === "free" ? "A focused starting point for testing outreach" : undefined,
        monthlyPrice: defaults.monthlyPrice,
        maxMailboxes: defaults.maxMailboxes,
        maxContacts: defaults.maxContacts,
        maxActiveCampaigns: defaults.maxActiveCampaigns,
        monthlySendLimit: defaults.monthlySendLimit,
        monthlyAiCalls: defaults.monthlyAiCalls,
        stripePriceIdMonthly: stripePriceId(defaults.code, "MONTH"),
        stripePriceIdYearly: stripePriceId(defaults.code, "YEAR")
      }
    });
    results[plan.code] = {
      code: plan.code,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      maxMailboxes: plan.maxMailboxes,
      maxContacts: plan.maxContacts,
      maxActiveCampaigns: plan.maxActiveCampaigns,
      monthlySendLimit: plan.monthlySendLimit,
      monthlyAiCalls: plan.monthlyAiCalls
    };
  }
  return results;
}

export type Entitlement = {
  plan: PlanLimits;
  subscriptionStatus: string | null;
  subscriptionActive: boolean;
  periodStart: Date;
  currentPeriodEnd: Date | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
};

function toLimits(plan: { code: string; name: string; monthlyPrice: number; maxMailboxes: number; maxContacts: number; maxActiveCampaigns: number; monthlySendLimit: number; monthlyAiCalls: number }): PlanLimits {
  return { ...plan };
}

export async function getWorkspaceEntitlement(workspaceId: string): Promise<Entitlement> {
  const subscription = await prisma.subscription.findUnique({ where: { workspaceId }, include: { plan: true } });
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  if (!subscription) {
    return { plan: PLAN_DEFAULTS.free, subscriptionStatus: null, subscriptionActive: false, periodStart: monthStart, currentPeriodEnd: null, providerCustomerId: null, providerSubscriptionId: null };
  }
  const active = subscription.status === "ACTIVE" || subscription.status === "TRIALING";
  return {
    plan: active ? toLimits(subscription.plan) : PLAN_DEFAULTS.free,
    subscriptionStatus: subscription.status,
    subscriptionActive: active,
    periodStart: subscription.currentPeriodStart ?? monthStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId
  };
}

export type UsageSummary = {
  mailboxes: number;
  contacts: number;
  activeCampaigns: number;
  monthlySends: number;
  monthlyAiCalls: number;
};

export async function getUsageSummary(workspaceId: string, periodStart: Date): Promise<UsageSummary> {
  const [mailboxes, contacts, activeCampaigns, monthlySends, monthlyAiCalls] = await Promise.all([
    prisma.mailbox.count({ where: { workspaceId } }),
    prisma.contact.count({ where: { workspaceId } }),
    prisma.campaign.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.emailMessage.count({ where: { workspaceId, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"] }, sentAt: { gte: periodStart } } }),
    prisma.aiUsage.count({ where: { workspaceId, createdAt: { gte: periodStart } } })
  ]);
  return { mailboxes, contacts, activeCampaigns, monthlySends, monthlyAiCalls };
}

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function checkMailboxLimit(workspaceId: string): Promise<Entitlement> {
  const entitlement = await getWorkspaceEntitlement(workspaceId);
  const count = await prisma.mailbox.count({ where: { workspaceId } });
  if (count >= entitlement.plan.maxMailboxes) throw new PlanLimitError(`Your ${entitlement.plan.name} plan allows ${entitlement.plan.maxMailboxes} mailbox${entitlement.plan.maxMailboxes === 1 ? "" : "es"}. Upgrade to add another.`);
  return entitlement;
}

export async function checkContactLimit(workspaceId: string, additional = 1): Promise<Entitlement> {
  const entitlement = await getWorkspaceEntitlement(workspaceId);
  const count = await prisma.contact.count({ where: { workspaceId } });
  if (count + additional > entitlement.plan.maxContacts) throw new PlanLimitError(`Your ${entitlement.plan.name} plan allows ${entitlement.plan.maxContacts} contacts. Upgrade or remove contacts first.`);
  return entitlement;
}

export async function checkActiveCampaignLimit(workspaceId: string): Promise<Entitlement> {
  const entitlement = await getWorkspaceEntitlement(workspaceId);
  const count = await prisma.campaign.count({ where: { workspaceId, status: "ACTIVE" } });
  if (count >= entitlement.plan.maxActiveCampaigns) throw new PlanLimitError(`Your ${entitlement.plan.name} plan allows ${entitlement.plan.maxActiveCampaigns} active campaign${entitlement.plan.maxActiveCampaigns === 1 ? "" : "s"}. Pause or complete one first, or upgrade.`);
  return entitlement;
}

export async function checkMonthlySendLimit(workspaceId: string): Promise<Entitlement> {
  const entitlement = await getWorkspaceEntitlement(workspaceId);
  const usage = await getUsageSummary(workspaceId, entitlement.periodStart);
  if (usage.monthlySends >= entitlement.plan.monthlySendLimit) throw new PlanLimitError(`Your ${entitlement.plan.name} plan allows ${entitlement.plan.monthlySendLimit} sends in this billing period. Upgrade to send more.`);
  return entitlement;
}

export async function checkAiUsageLimit(workspaceId: string): Promise<Entitlement> {
  const entitlement = await getWorkspaceEntitlement(workspaceId);
  const usage = await getUsageSummary(workspaceId, entitlement.periodStart);
  if (usage.monthlyAiCalls >= entitlement.plan.monthlyAiCalls) throw new PlanLimitError(`Your ${entitlement.plan.name} plan allows ${entitlement.plan.monthlyAiCalls} AI calls in this billing period. Upgrade for more.`);
  return entitlement;
}

export async function recordAiUsage(workspaceId: string, provider: string, model?: string): Promise<void> {
  try {
    await prisma.aiUsage.create({ data: { workspaceId, provider, model: model ?? null } });
  } catch (error) {
    // Usage telemetry must never block a send that was already authorised.
    logger.warn("ai_usage_record_failed", { workspaceId, error: error instanceof Error ? error.message : "unknown" });
  }
}

// ---- Stripe (REST API; no SDK dependency, so the webhook path stays auditable) ----

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeRequest(path: string, method: "GET" | "POST", params?: Record<string, string>): Promise<Record<string, unknown>> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  const body = params ? new URLSearchParams(params) : undefined;
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message ?? `Stripe request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export async function createCheckoutSession(input: { workspaceId: string; planCode: string; interval: "MONTH" | "YEAR"; customerId?: string | null; successUrl: string; cancelUrl: string }): Promise<{ url: string | null; id: string }> {
  const priceId = stripePriceId(input.planCode, input.interval);
  if (!priceId) throw new Error(`No Stripe price is configured for ${input.planCode}/${input.interval.toLowerCase()}. Set the STRIPE_PRICE_* variables first.`);
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "metadata[workspaceId]": input.workspaceId,
    "metadata[planCode]": input.planCode,
    "metadata[interval]": input.interval,
    client_reference_id: input.workspaceId
  };
  if (input.customerId) params.customer = input.customerId;
  const session = await stripeRequest("/checkout/sessions", "POST", params);
  return { url: (session.url as string | null) ?? null, id: session.id as string };
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string | null }> {
  const session = await stripeRequest("/billing_portal/sessions", "POST", { customer: customerId, return_url: returnUrl });
  return { url: (session.url as string | null) ?? null };
}



export async function handleStripeWebhook(event: { type: string; data: { object: Record<string, unknown> } }): Promise<{ handled: boolean }> {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    const workspaceId = (object.metadata as Record<string, string> | undefined)?.workspaceId ?? (object.client_reference_id as string | undefined);
    const planCode = (object.metadata as Record<string, string> | undefined)?.planCode;
    const interval = ((object.metadata as Record<string, string> | undefined)?.interval as "MONTH" | "YEAR" | undefined) ?? "MONTH";
    const subscriptionId = object.subscription as string | undefined;
    if (!workspaceId || !planCode) return { handled: false };
    await ensurePlans();
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) return { handled: false };
    let periodStart: Date | undefined;
    let periodEnd: Date | undefined;
    if (subscriptionId) {
      try {
        const stripeSub = await stripeRequest(`/subscriptions/${subscriptionId}`, "GET");
        if (typeof stripeSub.current_period_start === "number") periodStart = new Date(stripeSub.current_period_start * 1000);
        if (typeof stripeSub.current_period_end === "number") periodEnd = new Date(stripeSub.current_period_end * 1000);
      } catch (error) {
        logger.warn("stripe_subscription_lookup_failed", { error: error instanceof Error ? error.message : "unknown" });
      }
    }
    await prisma.subscription.upsert({
      where: { workspaceId },
      update: { planId: plan.id, status: "ACTIVE", interval, providerCustomerId: (object.customer as string) ?? undefined, providerSubscriptionId: subscriptionId, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
      create: { workspaceId, planId: plan.id, status: "ACTIVE", interval, providerCustomerId: (object.customer as string) ?? undefined, providerSubscriptionId: subscriptionId, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }
    });
    return { handled: true };
  }
  if (event.type.startsWith("customer.subscription.")) {
    const subscriptionId = object.id as string;
    const status = mapStripeStatus(String(object.status ?? ""));
    const existing = await prisma.subscription.findFirst({ where: { providerSubscriptionId: subscriptionId } });
    if (!existing) return { handled: false };
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        currentPeriodStart: typeof object.current_period_start === "number" ? new Date(object.current_period_start * 1000) : undefined,
        currentPeriodEnd: typeof object.current_period_end === "number" ? new Date(object.current_period_end * 1000) : undefined
      }
    });
    return { handled: true };
  }
  return { handled: false };
}
