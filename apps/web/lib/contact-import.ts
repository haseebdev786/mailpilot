import * as XLSX from "xlsx";

export type ImportRow = Record<string, string>;
export type ContactMapping = { name?: string; email?: string; company?: string; website?: string; customFields?: string[]; tags?: string };

export async function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: ImportRow[] }> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Upload a file smaller than 5 MB");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Upload a CSV or Excel file");
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, sheetRows: 10002 });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The uploaded workbook has no sheets");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "", raw: false }).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? "").trim()])));
  if (!rows.length || rows.length > 10000) throw new Error("Upload between 1 and 10,000 contacts at a time");
  return { headers: Object.keys(rows[0] ?? {}), rows };
}

export function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export function valueFor(row: ImportRow, header?: string) { return header ? (row[header] ?? "").trim() : ""; }
