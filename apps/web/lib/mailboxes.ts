import { z } from "zod";
import { decryptSecret } from "@mailpilot/shared/crypto";

type MailboxRecord = {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  provider: "SMTP_IMAP" | "GOOGLE" | "MICROSOFT" | "OTHER";
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpPasswordEncrypted: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  imapUsername: string | null;
  imapPasswordEncrypted: string | null;
  fromName: string | null;
  signature: string | null;
  businessAddress: string | null;
  dailySendLimit: number;
  warmupEnabled: boolean;
  warmupStartPerDay: number;
  warmupRampPerDay: number;
  warmupDay: number;
  healthStatus: "UNKNOWN" | "CONNECTED" | "ERROR";
  healthError: string | null;
  lastTestedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const host = z.string().trim().min(1).max(255);
const port = z.coerce.number().int().min(1).max(65535);

export const mailboxCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  smtpHost: host,
  smtpPort: port.default(587),
  smtpSecure: z.boolean().default(false),
  smtpUsername: z.string().trim().min(1).max(160),
  smtpPassword: z.string().min(1).max(500),
  imapHost: host,
  imapPort: port.default(993),
  imapSecure: z.boolean().default(true),
  imapUsername: z.string().trim().min(1).max(160),
  imapPassword: z.string().min(1).max(500),
  fromName: z.string().trim().max(120).optional().or(z.literal("")),
  signature: z.string().max(4000).optional().or(z.literal("")),
  businessAddress: z.string().max(500).optional().or(z.literal("")),
  dailySendLimit: z.coerce.number().int().min(1).max(1000).default(40),
  warmupEnabled: z.boolean().default(false),
  warmupStartPerDay: z.coerce.number().int().min(1).max(1000).default(10),
  warmupRampPerDay: z.coerce.number().int().min(0).max(500).default(5)
});

export const mailboxPatchSchema = mailboxCreateSchema.partial().extend({
  isActive: z.boolean().optional()
});

export function safeMailbox(mailbox: MailboxRecord) {
  return {
    id: mailbox.id,
    name: mailbox.name,
    email: mailbox.email,
    provider: mailbox.provider,
    smtpHost: mailbox.smtpHost,
    smtpPort: mailbox.smtpPort,
    smtpSecure: mailbox.smtpSecure,
    smtpUsername: mailbox.smtpUsername,
    imapHost: mailbox.imapHost,
    imapPort: mailbox.imapPort,
    imapSecure: mailbox.imapSecure,
    imapUsername: mailbox.imapUsername,
    fromName: mailbox.fromName,
    signature: mailbox.signature,
    businessAddress: mailbox.businessAddress,
    dailySendLimit: mailbox.dailySendLimit,
    warmupEnabled: mailbox.warmupEnabled,
    warmupStartPerDay: mailbox.warmupStartPerDay,
    warmupRampPerDay: mailbox.warmupRampPerDay,
    warmupDay: mailbox.warmupDay,
    healthStatus: mailbox.healthStatus,
    healthError: mailbox.healthError,
    lastTestedAt: mailbox.lastTestedAt,
    isActive: mailbox.isActive,
    createdAt: mailbox.createdAt,
    updatedAt: mailbox.updatedAt
  };
}

export function credentialsFromMailbox(mailbox: MailboxRecord) {
  if (!mailbox.smtpHost || !mailbox.smtpPort || !mailbox.smtpUsername || !mailbox.smtpPasswordEncrypted || !mailbox.imapHost || !mailbox.imapPort || !mailbox.imapUsername || !mailbox.imapPasswordEncrypted) throw new Error("Mailbox credentials are incomplete");
  return {
    smtpHost: mailbox.smtpHost,
    smtpPort: mailbox.smtpPort,
    smtpSecure: mailbox.smtpSecure,
    smtpUsername: mailbox.smtpUsername,
    smtpPassword: decryptSecret(mailbox.smtpPasswordEncrypted),
    imapHost: mailbox.imapHost,
    imapPort: mailbox.imapPort,
    imapSecure: mailbox.imapSecure,
    imapUsername: mailbox.imapUsername,
    imapPassword: decryptSecret(mailbox.imapPasswordEncrypted)
  };
}
