import { NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/contact-import";
import { getCurrentAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!await getCurrentAuth()) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV or Excel file is required" }, { status: 400 });
  try { const parsed = await parseSpreadsheet(file); return NextResponse.json({ fileName: file.name, headers: parsed.headers, sample: parsed.rows.slice(0, 5), total: parsed.rows.length }); } catch { return NextResponse.json({ error: "Unable to read that spreadsheet" }, { status: 400 }); }
}
