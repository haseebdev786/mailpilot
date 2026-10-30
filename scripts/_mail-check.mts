import { prisma } from "@mailpilot/shared/db";
import { decryptSecret } from "@mailpilot/shared/crypto";
import { testMailboxConnection } from "@mailpilot/shared/mail";
const m = await prisma.mailbox.findFirstOrThrow();
console.log("mailbox:", m.email, m.smtpHost, m.smtpPort, m.smtpSecure, "imap:", m.imapHost, m.imapPort, m.imapSecure);
console.log("smtp user:", m.smtpUsername, "pass length:", m.smtpPasswordEncrypted ? decryptSecret(m.smtpPasswordEncrypted).length : 0);
console.log("imap user:", m.imapUsername, "pass set:", Boolean(m.imapPasswordEncrypted));
try {
  const r = await testMailboxConnection({
    smtpHost: m.smtpHost!, smtpPort: m.smtpPort!, smtpSecure: m.smtpSecure,
    smtpUsername: m.smtpUsername!, smtpPassword: decryptSecret(m.smtpPasswordEncrypted!),
    imapHost: m.imapHost ?? "", imapPort: m.imapPort ?? 993, imapSecure: m.imapSecure ?? true,
    imapUsername: m.imapUsername ?? "", imapPassword: m.imapPasswordEncrypted ? decryptSecret(m.imapPasswordEncrypted) : ""
  });
  console.log("CONNECTION OK", r);
} catch (e) { console.log("CONNECTION FAIL:", e.message); }
await prisma.$disconnect();
