import { prisma } from "@mailpilot/shared/db";
const steps = await prisma.sequenceStep.findMany({ orderBy: [{campaignId:"asc"},{position:"asc"}] });
for (const s of steps) console.log(JSON.stringify({ campaignId: s.campaignId, pos: s.position, type: s.type, delayHours: s.delayHours, subject: s.subject, body: (s.templateBody??"").slice(0,80) }));
const emails = await prisma.emailMessage.findMany({ orderBy: { createdAt: "asc" } });
for (const e of emails) console.log(JSON.stringify({ dir: e.direction, status: e.status, to: e.toEmail, subject: e.subject, createdAt: e.createdAt, sentAt: e.sentAt }));
const contacts = await prisma.contact.findMany({ select: { email: true, firstName: true, status: true } });
console.log(contacts);
await prisma.$disconnect();
