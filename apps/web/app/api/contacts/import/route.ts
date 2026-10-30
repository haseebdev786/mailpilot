import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getOutreachQueue } from "@mailpilot/shared/queue";
import { checkContactLimit, PlanLimitError } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";
import { parseSpreadsheet, type ContactMapping } from "@/lib/contact-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV or Excel file is required" }, { status: 400 });
  let mapping: ContactMapping;
  try { mapping = JSON.parse(String(form.get("mapping") ?? "{}")) as ContactMapping; } catch { return NextResponse.json({ error: "Column mapping is invalid" }, { status: 400 }); }
  const listId = String(form.get("listId") ?? "") || null;
  if (listId) { const list = await prisma.contactList.findFirst({ where: { id: listId, workspaceId: auth.workspace.id } }); if (!list) return NextResponse.json({ error: "Contact list not found" }, { status: 404 }); }
  try {
    const parsed = await parseSpreadsheet(file);
    try { await checkContactLimit(auth.workspace.id, parsed.rows.length); } catch (error) { if (error instanceof PlanLimitError) return NextResponse.json({ error: error.message }, { status: 402 }); throw error; }
    if (typeof mapping.email !== "string" || !parsed.headers.includes(mapping.email)) return NextResponse.json({ error: "Map the email column before importing" }, { status: 400 });
    const queue = getOutreachQueue();
    try { await queue.getJobCounts("waiting"); } catch { return NextResponse.json({ error: "Import queue unavailable. Start Redis and the worker, then try again." }, { status: 503 }); }
    const job = await prisma.importJob.create({ data: { workspaceId: auth.workspace.id, createdById: auth.user.id, listId, fileName: file.name, total: parsed.rows.length } });
    try { await queue.add("contact-import", { importJobId: job.id, workspaceId: auth.workspace.id, rows: parsed.rows, mapping, listId }, { jobId: `import-${job.id}` }); }
    catch { await prisma.importJob.update({ where: { id: job.id }, data: { status: "FAILED" } }); return NextResponse.json({ error: "Unable to queue import. Please try again." }, { status: 503 }); }
    return NextResponse.json({ jobId: job.id, total: parsed.rows.length }, { status: 202 });
  } catch { return NextResponse.json({ error: "Unable to queue this import" }, { status: 400 }); }
}
