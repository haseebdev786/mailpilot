import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { MailboxCredentials, InboxProvider, OutboundMailProvider } from "./providers";
import { resolveMailServer } from "./mail-network";

async function smtpTransport(credentials: MailboxCredentials) {
  const server = await resolveMailServer(credentials.smtpHost);
  const auth = credentials.oauthAccessToken
    ? { type: "OAuth2" as const, user: credentials.smtpUsername, accessToken: credentials.oauthAccessToken }
    : { user: credentials.smtpUsername, pass: credentials.smtpPassword };
  return nodemailer.createTransport({ host: server.address, tls: { servername: server.servername }, port: credentials.smtpPort, secure: credentials.smtpSecure, requireTLS: !credentials.smtpSecure, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000, auth });
}

export async function createImapClient(credentials: MailboxCredentials) {
  const server = await resolveMailServer(credentials.imapHost);
  const auth = credentials.oauthAccessToken
    ? { user: credentials.imapUsername, accessToken: credentials.oauthAccessToken }
    : { user: credentials.imapUsername, pass: credentials.imapPassword };
  return new ImapFlow({ logger: false, connectionTimeout: 15_000, socketTimeout: 30_000, host: server.address, tls: { servername: server.servername }, port: credentials.imapPort, secure: credentials.imapSecure, doSTARTTLS: !credentials.imapSecure, auth });
}

export function createSmtpProvider(credentials: MailboxCredentials): OutboundMailProvider {
  return { async send(input) {
    const transport = await smtpTransport(credentials);
    try { const result = await transport.sendMail(input); return { messageId: result.messageId }; }
    finally { transport.close(); }
  } };
}

export async function testMailboxConnection(credentials: MailboxCredentials): Promise<{ smtp: true; imap: true }> {
  const smtp = await smtpTransport(credentials);
  try { await smtp.verify(); } finally { smtp.close(); }
  const client = await createImapClient(credentials);
  try { await client.connect(); await client.mailboxOpen("INBOX", { readOnly: true }); }
  finally { if (client.usable) await client.logout(); }
  return { smtp: true, imap: true };
}

export function createImapProvider(credentials: MailboxCredentials): InboxProvider & { close(): Promise<void> } {
  let client: ImapFlow | undefined;
  return {
    async sync() {
      client = await createImapClient(credentials);
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try { const status = await client.status("INBOX", { messages: true }); return { imported: status.messages ?? 0 }; }
      finally { lock.release(); if (client.usable) await client.logout(); }
    },
    async close() { if (client?.usable) await client.logout(); }
  };
}
