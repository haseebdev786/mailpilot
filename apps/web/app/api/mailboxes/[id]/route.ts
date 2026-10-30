import { NextResponse } from "next/server";
import { encryptSecret } from "@mailpilot/shared/crypto";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";
import { mailboxPatchSchema, safeMailbox } from "@/lib/mailboxes";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.mailbox.findFirst({ where: { id, workspaceId: auth.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  try {
    const input = mailboxPatchSchema.parse(await request.json());
    const data = { ...input, ...(input.email ? { email: input.email.toLowerCase() } : {}), ...(input.smtpPassword ? { smtpPasswordEncrypted: encryptSecret(input.smtpPassword) } : {}), ...(input.imapPassword ? { imapPasswordEncrypted: encryptSecret(input.imapPassword) } : {}) } as Record<string, unknown>;
    delete data.smtpPassword;
    delete data.imapPassword;
    const connectionFields = ["email", "smtpHost", "smtpPort", "smtpSecure", "smtpUsername", "smtpPassword", "imapHost", "imapPort", "imapSecure", "imapUsername", "imapPassword"] as const;
    if (connectionFields.some((field) => field in input && (field.endsWith("Password") || input[field] !== existing[field as keyof typeof existing]))) {
      data.healthStatus = "UNKNOWN";
      data.healthError = null;
      data.lastTestedAt = null;
    }
    const mailbox = await prisma.mailbox.update({ where: { id }, data });
    return NextResponse.json({ mailbox: safeMailbox(mailbox) });
  } catch {
    return NextResponse.json({ error: "Mailbox details are invalid." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const deleted = await prisma.mailbox.deleteMany({ where: { id, workspaceId: auth.workspace.id } });
  if (!deleted.count) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
