import { createAiProvider } from "./ai";

export type ReplyIntent = "INTERESTED" | "ASKING_PRICE" | "ASKING_DETAILS" | "NOT_INTERESTED" | "UNSUBSCRIBE" | "OUT_OF_OFFICE" | "BOUNCE" | "OTHER";
export type ReplyAnalysis = { classification: ReplyIntent; confidence: number; summary: string; draft: string | null; needsAttention: boolean };

const unsubscribe = /(?:^|\n)\s*(?:unsubscribe|stop|remove me|opt out)[.! ]*\s*(?:$|\n)|\b(?:unsubscribe me|remove me|stop emailing|take me off|do not contact|don't email|opt me out)\b/i;
const bounce = /delivery status notification|mailbox unavailable|user unknown|message not delivered|undeliverable|returned mail/i;
const ooo = /out of office|automatic reply|vacation|away from the office|戻/i;
const notInterested = /not interested|no thanks|please don't|do not need|pass for now/i;
const price = /price|pricing|cost|budget|rate|how much|quote/i;

function heuristic(text: string): ReplyIntent {
  if (unsubscribe.test(text)) return "UNSUBSCRIBE";
  if (bounce.test(text)) return "BOUNCE";
  if (ooo.test(text)) return "OUT_OF_OFFICE";
  if (notInterested.test(text)) return "NOT_INTERESTED";
  if (price.test(text)) return "ASKING_PRICE";
  if (/interested|sounds good|let's talk|book|call|learn more|yes/i.test(text)) return "INTERESTED";
  if (text.includes("?") || /tell me|details|how does|what do you/i.test(text)) return "ASKING_DETAILS";
  return "OTHER";
}

export function extractReplyText(text: string) {
  const lines = text.split(/\r?\n/);
  const boundary = lines.findIndex((line, index) => /^\s*-{2,}\s*(?:original message|forwarded message)/i.test(line) ||
    (/^On\s/i.test(line.trim()) && lines.slice(index, index + 4).join(" ").includes("wrote:")) ||
    (/^From:\s/i.test(line) && lines.slice(index + 1, index + 5).some((next) => /^(Sent|Date|To):\s/i.test(next))));
  return (boundary < 0 ? lines : lines.slice(0, boundary)).filter((line) => !/^\s*>/.test(line)).join("\n").trim();
}

export async function analyzeReply(input: { text: string; subject?: string; knowledgeBase?: string; autoDraft?: boolean }): Promise<ReplyAnalysis> {
  input = { ...input, text: extractReplyText(input.text) };
  const fallback = heuristic(`${input.subject ?? ""}\n${input.text}`);
  if (["UNSUBSCRIBE", "BOUNCE", "OUT_OF_OFFICE", "NOT_INTERESTED"].includes(fallback)) {
    return { classification: fallback, confidence: 1, summary: input.text.slice(0, 180), draft: null, needsAttention: false };
  }
  try {
    const provider = createAiProvider();
    const result = await provider.generateText({ system: "Classify business email replies. Return strict JSON with classification, confidence, summary, needsAttention. classification must be one of INTERESTED, ASKING_PRICE, ASKING_DETAILS, NOT_INTERESTED, UNSUBSCRIBE, OUT_OF_OFFICE, BOUNCE, OTHER.", prompt: `Email subject: ${input.subject ?? ""}\nEmail body: ${input.text}`, temperature: 0, maxTokens: 250 });
    const parsed = JSON.parse(result.text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as Partial<ReplyAnalysis>;
    const classification = parsed.classification && ["INTERESTED", "ASKING_PRICE", "ASKING_DETAILS", "NOT_INTERESTED", "UNSUBSCRIBE", "OUT_OF_OFFICE", "BOUNCE", "OTHER"].includes(parsed.classification) ? parsed.classification as ReplyIntent : fallback;
    return { classification, confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.6))), summary: String(parsed.summary ?? input.text.slice(0, 180)), draft: null, needsAttention: Boolean(parsed.needsAttention) || classification === "OTHER" };
  } catch {
    return { classification: fallback, confidence: 0.55, summary: input.text.slice(0, 180), draft: null, needsAttention: fallback === "OTHER" };
  }
}

export async function draftKnowledgeBaseReply(input: { message: string; knowledgeBase: string; classification: ReplyIntent }): Promise<{ draft: string; needsAttention: boolean }> {
  if (input.classification === "UNSUBSCRIBE" || input.classification === "NOT_INTERESTED" || input.classification === "BOUNCE" || input.classification === "OUT_OF_OFFICE") return { draft: "", needsAttention: false };
  try {
    const provider = createAiProvider();
    const result = await provider.generateText({ system: "Write a short, polite human business reply using ONLY the supplied Knowledge Base. Never invent capabilities, prices, timelines, or commitments. If the message asks for a price, quote only a number between pricingMin and pricingMax from the Knowledge Base. If information is missing or the request is custom work, return NEEDS_ATTENTION. Return strict JSON with draft and needsAttention.", prompt: `Knowledge Base:\n${input.knowledgeBase}\n\nLead message:\n${input.message}\n\nIntent: ${input.classification}`, temperature: 0.2, maxTokens: 350 });
    const parsed = JSON.parse(result.text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as { draft?: string; needsAttention?: boolean };
    if (!parsed.draft || parsed.needsAttention) return { draft: parsed.draft ?? "", needsAttention: true };
    return { draft: parsed.draft.slice(0, 1200), needsAttention: false };
  } catch { return { draft: "", needsAttention: true }; }
}
