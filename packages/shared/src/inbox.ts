import { createImapClient } from "./mail";
import { simpleParser } from "mailparser";
import type { MailboxCredentials } from "./providers";

export type ParsedInboundMessage = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string | null;
  receivedAt: Date;
};

export async function fetchNewInboundMessages(credentials: MailboxCredentials, lastUid: number): Promise<{ messages: ParsedInboundMessage[]; lastUid: number }> {
  const client = await createImapClient(credentials);
  const messages: ParsedInboundMessage[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  let newestUid = lastUid;
  try {
    for await (const message of client.fetch({ uid: `${lastUid + 1}:*` }, { uid: true, source: true, internalDate: true }, { uid: true })) {
      // IMAP's n:* can include the last message even when n exceeds the last UID.
      if (message.uid <= lastUid) continue;
      const parsed = await simpleParser(message.source as Buffer);
      const fromEmail = parsed.from && "value" in parsed.from ? parsed.from.value[0]?.address?.toLowerCase() ?? "" : "";
      const toEmail = parsed.to && "value" in parsed.to ? parsed.to.value[0]?.address?.toLowerCase() ?? credentials.imapUsername.toLowerCase() : credentials.imapUsername.toLowerCase();
      const messageId = parsed.messageId?.trim() || null;
      const inReplyTo = parsed.inReplyTo?.trim() || null;
      const references = Array.isArray(parsed.references) ? parsed.references.map((item) => String(item).trim()).filter(Boolean) : parsed.references ? [String(parsed.references).trim()] : [];
      messages.push({ uid: message.uid, messageId, inReplyTo, references, fromEmail, toEmail, subject: parsed.subject?.trim() ?? "", text: parsed.text?.trim() ?? "", html: typeof parsed.html === "string" ? parsed.html : null, receivedAt: parsed.date ? new Date(parsed.date) : message.internalDate ? new Date(message.internalDate) : new Date() });
      newestUid = Math.max(newestUid, message.uid);
    }
  } finally {
    lock.release();
    if (client.usable) await client.logout();
  }
  return { messages, lastUid: newestUid };
}
