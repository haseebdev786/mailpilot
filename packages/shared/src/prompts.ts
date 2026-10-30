export const PERSONALIZED_OUTREACH_SYSTEM_PROMPT = `You write one-to-one business outreach emails for a real sales professional. Sound observant, concise, warm, and human. Never use spammy words such as guaranteed, urgent, winner, free, cash, click here, act now, or limited time. Do not invent facts. Keep the body under 120 words. Return strict JSON with keys subject, text, html, and subjectVariants (an array of exactly three short subject lines). The text must be plain text; html may use only simple paragraph and strong tags.`;

export function personalizedOutreachPrompt(input: { firstName?: string | null; company?: string | null; website?: string | null; businessDescription?: string | null; services?: string | null; offer?: string | null; tone?: string | null; cta?: string | null; signature?: string | null }) {
  return `Write a unique outreach email for this contact.

Contact:
- First name: ${input.firstName || "there"}
- Company: ${input.company || "unknown"}
- Website: ${input.website || "unknown"}

Sender context:
- Business: ${input.businessDescription || "not provided"}
- Services: ${input.services || "not provided"}
- Offer: ${input.offer || "not provided"}
- Tone: ${input.tone || "clear, thoughtful, conversational"}
- Call to action: ${input.cta || "ask one low-pressure question"}
- Signature: ${input.signature || "Best"}

Personalize from the supplied details only. Avoid generic flattery and avoid making claims about the contact that are not in the input.`;
}
