import { decryptSecret } from "./crypto";
import { oauthMailboxHosts, refreshMailboxAccessToken } from "./oauth-mail";
import type { MailboxCredentials } from "./providers";

type MailboxRecord = {
  id: string;
  provider: string;
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
  oauthAccessTokenEncrypted: string | null;
  oauthTokenExpiresAt: Date | null;
  oauthRefreshTokenEncrypted: string | null;
};

/** Resolves password or OAuth (XOAUTH2) credentials for a mailbox, refreshing OAuth tokens. */
export async function getMailboxCredentials(mailbox: MailboxRecord): Promise<MailboxCredentials> {
  if ((mailbox.provider === "GOOGLE" || mailbox.provider === "MICROSOFT") && mailbox.oauthRefreshTokenEncrypted) {
    const hosts = oauthMailboxHosts(mailbox.provider);
    const accessToken = await refreshMailboxAccessToken(mailbox);
    return {
      smtpHost: mailbox.smtpHost ?? hosts.smtpHost,
      smtpPort: mailbox.smtpPort ?? hosts.smtpPort,
      smtpSecure: mailbox.smtpSecure,
      smtpUsername: mailbox.smtpUsername ?? "",
      smtpPassword: "",
      imapHost: mailbox.imapHost ?? hosts.imapHost,
      imapPort: mailbox.imapPort ?? hosts.imapPort,
      imapSecure: mailbox.imapSecure,
      imapUsername: mailbox.imapUsername ?? "",
      imapPassword: "",
      oauthAccessToken: accessToken
    };
  }
  if (!mailbox.smtpHost || !mailbox.smtpPort || !mailbox.smtpUsername || !mailbox.smtpPasswordEncrypted || !mailbox.imapHost || !mailbox.imapPort || !mailbox.imapUsername || !mailbox.imapPasswordEncrypted) {
    throw new Error("Mailbox credentials are incomplete");
  }
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

export function mailboxHasUsableCredentials(mailbox: { smtpPasswordEncrypted: string | null; oauthRefreshTokenEncrypted: string | null }): boolean {
  return Boolean(mailbox.smtpPasswordEncrypted || mailbox.oauthRefreshTokenEncrypted);
}
