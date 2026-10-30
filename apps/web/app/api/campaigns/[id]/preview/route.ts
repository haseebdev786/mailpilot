import { NextResponse } from "next/server";
import { generatePersonalizedEmail } from "@mailpilot/shared/campaign-ai";
import { prisma } from "@mailpilot/shared/db";
import { checkAiUsageLimit, PlanLimitError, recordAiUsage } from "@mailpilot/shared/billing";
import { isAiConfigured } from "@mailpilot/shared/ai";
import { getCurrentAuth } from "@/lib/auth";
import { renderTemplate, textToHtml } from "@mailpilot/shared/email-content";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { contactId?: string };
  if (typeof body.contactId !== "string" || !body.contactId) return NextResponse.json({ error: "Choose a campaign recipient" }, { status: 400 });
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: auth.workspace.id }, include: { steps: { where: { position: 0 }, take: 1 } } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const contact = await prisma.contact.findFirst({ where: { id: body.contactId, workspaceId: auth.workspace.id, campaignLinks: { some: { campaignId: id } } } });
  if (!contact) return NextResponse.json({ error: "Choose a recipient from this campaign" }, { status: 400 });
  try {
    const template = campaign.steps[0];
    const subject = template?.subject ? renderTemplate(template.subject, contact) : "";
    const text = subject ? renderTemplate(template.templateBody ?? "", contact) : "";
    let draft;
    if (subject && text) {
      draft = { subject, text, html: textToHtml(text), subjectVariants: [subject], provider: "template", model: "template" };
    } else {
      if (isAiConfigured()) {
        try { await checkAiUsageLimit(auth.workspace.id); } catch (error) { if (error instanceof PlanLimitError) return NextResponse.json({ error: error.message }, { status: 402 }); throw error; }
      }
      draft = await generatePersonalizedEmail({ firstName: contact.firstName, company: contact.company, website: contact.website, businessDescription: campaign.businessDescription, services: campaign.services, offer: campaign.offer, tone: campaign.tone, cta: campaign.cta, signature: campaign.signature });
      if (draft.provider !== "local") await recordAiUsage(auth.workspace.id, draft.provider, draft.model);
    }
    await prisma.campaignContact.update({ where: { campaignId_contactId: { campaignId: id, contactId: contact.id } }, data: { generatedSubject: draft.subject, generatedText: draft.text, generatedHtml: draft.html, generatedAt: new Date(), lastError: null } });
    return NextResponse.json({ draft, contact: { id: contact.id, email: contact.email, firstName: contact.firstName, company: contact.company } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate a draft" }, { status: 502 }); }
}
