import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";

type ImportRow = Record<string, string>;
type ContactMapping = { name?: string; email?: string; company?: string; website?: string; customFields?: string[]; tags?: string };
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
const splitName = (value: string) => { const parts = value.trim().split(/\s+/).filter(Boolean); return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null }; };
const valueFor = (row: ImportRow, header?: string) => header ? (row[header] ?? "").trim() : "";

type ContactImportData = { importJobId: string; workspaceId: string; rows: ImportRow[]; mapping: ContactMapping; listId?: string | null };

export async function processContactImport(data: ContactImportData) {
  const { importJobId, workspaceId, rows, mapping, listId } = data;
  const job = await prisma.importJob.findFirst({ where: { id: importJobId, workspaceId } });
  if (!job || job.status === "COMPLETED") return { skipped: true };
  if (listId && !await prisma.contactList.findFirst({ where: { id: listId, workspaceId }, select: { id: true } })) throw new Error("Import list is unavailable");
  await prisma.importJob.update({ where: { id: importJobId }, data: { status: "PROCESSING" } });
  const normalized: Array<{ email: string; firstName: string | null; lastName: string | null; company: string | null; website: string | null; customFields: Record<string, string> | undefined; tags: string[] }> = [];
  let invalid = 0;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const email = valueFor(row, mapping.email).toLowerCase();
    if (!isValidEmail(email)) { invalid += 1; continue; }
    if (seen.has(email)) { duplicates += 1; continue; }
    seen.add(email);
    const name = splitName(valueFor(row, mapping.name));
    const customFields = Object.fromEntries((mapping.customFields ?? []).map((header) => [header, valueFor(row, header)]).filter(([, value]) => value));
    const tags = valueFor(row, mapping.tags).split(",").map((tag) => tag.trim()).filter(Boolean);
    normalized.push({ email, firstName: name.firstName, lastName: name.lastName, company: valueFor(row, mapping.company) || null, website: valueFor(row, mapping.website) || null, customFields: Object.keys(customFields).length ? customFields : undefined, tags });
  }
  const emails = normalized.map((row) => row.email);
  const [existing, suppressed] = await Promise.all([prisma.contact.findMany({ where: { workspaceId, email: { in: emails } }, select: { email: true } }), prisma.suppressionList.findMany({ where: { workspaceId, email: { in: emails } }, select: { email: true } })]);
  const existingSet = new Set(existing.map((row) => row.email));
  const suppressedSet = new Set(suppressed.map((row) => row.email));
  let suppressedCount = 0;
  let valid = 0;
  let processed = 0;
  for (const row of normalized) {
    processed += 1;
    if (suppressedSet.has(row.email)) { suppressedCount += 1; continue; }
    if (existingSet.has(row.email)) { duplicates += 1; continue; }
    try {
      const contact = await prisma.contact.create({ data: { workspaceId, email: row.email, firstName: row.firstName, lastName: row.lastName, company: row.company, website: row.website, customFields: row.customFields, source: "import", lists: listId ? { connect: { id: listId } } : undefined } });
      for (const tagName of row.tags) {
        const tag = await prisma.contactTag.upsert({ where: { workspaceId_name: { workspaceId, name: tagName } }, update: {}, create: { workspaceId, name: tagName } });
        await prisma.contactTagAssignment.create({ data: { contactId: contact.id, tagId: tag.id } });
      }
      valid += 1;
      existingSet.add(row.email);
    } catch (error) {
      duplicates += 1;
      logger.warn("contact_import_row_skipped", { importJobId, reason: error instanceof Error ? error.message : "unknown" });
    }
    if (processed % 100 === 0) await prisma.importJob.update({ where: { id: importJobId }, data: { processed, valid, invalid, duplicates, suppressed: suppressedCount } });
  }
  const final = await prisma.importJob.update({ where: { id: importJobId }, data: { status: "COMPLETED", processed: rows.length, valid, invalid, duplicates, suppressed: suppressedCount, summary: { valid, invalid, duplicates, suppressed: suppressedCount } } });
  return final;
}
