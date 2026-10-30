import { prisma } from "@mailpilot/shared/db";
const lists = await prisma.contactList.findMany({ include: { _count: { select: { contacts: true } } } });
console.log(lists.map(l => ({ id: l.id, name: l.name, count: l._count.contacts })));
const h = await prisma.contact.findFirst({ where: { email: "haseebdev786@gmail.com" }, include: { lists: true } });
console.log(h?.id, h?.lists.map(l => l.name));
const kb = await prisma.knowledgeBase.findFirst();
console.log(kb);
await prisma.$disconnect();
