export type MailboxCredentials = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
};

export interface OutboundMailProvider {
  send(input: { from: string; to: string; subject: string; text: string; html?: string; messageId?: string; inReplyTo?: string; replyTo?: string; headers?: Record<string, string> }): Promise<{ messageId: string }>;
}

export interface InboxProvider {
  sync(): Promise<{ imported: number }>;
}

export type AiProviderKind = "openai" | "anthropic";

export interface TextGenerationProvider {
  readonly kind: AiProviderKind;
  generate(input: { system?: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<{ text: string; model: string }>;
}
