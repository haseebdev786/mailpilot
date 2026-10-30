import { prisma } from "@mailpilot/shared/db";
console.log(await prisma.campaign.findUnique({ where: { id: "cmvm1b8em0009qqpky178fl96" }, select: { status: true, launchedAt: true } }));
await prisma.$disconnect();
