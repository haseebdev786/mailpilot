import { prisma } from "@mailpilot/shared/db";
const m = await prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, toEmail: true, subject: true, createdAt: true, sentAt: true } });
console.log(m);
const c = await prisma.campaignContact.findFirst({ where: { campaignId: "cmvm1b8em0009qqpky178fl96" }, select: { completedAt: true, lastError: true, currentStep: true } });
console.log(c);
await prisma.$disconnect();
