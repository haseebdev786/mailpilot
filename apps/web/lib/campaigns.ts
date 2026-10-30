import { z } from "zod";
import { validTimezone } from "@mailpilot/shared/sending-policy";

export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  listId: z.string().min(1),
  mailboxIds: z.array(z.string().min(1)).min(1),
  businessDescription: z.string().trim().min(1).max(2000),
  services: z.string().trim().min(1).max(2000),
  offer: z.string().trim().max(1000).optional().or(z.literal("")),
  tone: z.string().trim().max(160).default("clear, thoughtful, conversational"),
  cta: z.string().trim().max(500).default("ask one low-pressure question"),
  signature: z.string().trim().max(2000).optional().or(z.literal("")),
  templateSubject: z.string().trim().max(200).refine((value) => !/[\r\n]/.test(value), "Subject must be one line").default(""),
  templateText: z.string().trim().max(6000).default(""),
  sendingDelayMin: z.coerce.number().int().min(0).max(86400).default(120),
  sendingDelayMax: z.coerce.number().int().min(0).max(86400).default(180),
  sendingStartHour: z.coerce.number().int().min(0).max(23).default(9),
  sendingEndHour: z.coerce.number().int().min(1).max(24).default(18),
  timezone: z.string().trim().min(1).max(80).refine(validTimezone, "Enter a valid timezone, such as Asia/Karachi").default("UTC"),
  skipWeekends: z.boolean().default(true)
  ,replyMode: z.enum(["APPROVAL", "AUTO"]).default("APPROVAL")
  ,followUps: z.array(z.object({ delayHours: z.coerce.number().int().min(1).max(720), instruction: z.string().trim().max(1000) })).max(5).default([{ delayHours: 24, instruction: "Ask if they are interested in our service." }, { delayHours: 72, instruction: "Follow up with a concise, helpful reminder." }])
}).refine((input) => input.sendingDelayMax >= input.sendingDelayMin, { message: "Maximum delay must be at least the minimum delay" })
  .refine((input) => input.sendingEndHour > input.sendingStartHour, { message: "End hour must be after start hour" })
  .refine((input) => Boolean(input.templateSubject) === Boolean(input.templateText), { message: "Provide both template subject and body" });

export function safeCampaign(campaign: { id: string; name: string; status: string; businessDescription: string | null; services: string | null; offer: string | null; tone: string | null; cta: string | null; signature: string | null; sendingDelayMin: number; sendingDelayMax: number; sendingStartHour: number; sendingEndHour: number; timezone: string; skipWeekends: boolean; createdAt: Date; launchedAt?: Date | null; _count?: { recipients: number } }) {
  return { id: campaign.id, name: campaign.name, status: campaign.status, businessDescription: campaign.businessDescription, services: campaign.services, offer: campaign.offer, tone: campaign.tone, cta: campaign.cta, signature: campaign.signature, sendingDelayMin: campaign.sendingDelayMin, sendingDelayMax: campaign.sendingDelayMax, sendingStartHour: campaign.sendingStartHour, sendingEndHour: campaign.sendingEndHour, timezone: campaign.timezone, skipWeekends: campaign.skipWeekends, createdAt: campaign.createdAt, launchedAt: campaign.launchedAt ?? null, recipientCount: campaign._count?.recipients ?? 0 };
}

export function textToHtml(text: string) { return text.split(/\n+/).map((paragraph) => `<p>${paragraph.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character] ?? character))}</p>`).join(""); }

export function messageIdFor(hostname: string, seed: string) { return `<${seed.replace(/[^a-zA-Z0-9-]/g, "-")}@${hostname}>`; }
