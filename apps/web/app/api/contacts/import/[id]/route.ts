import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.importJob.findFirst({ where: { id, workspaceId: auth.workspace.id } });
  if (!job) return NextResponse.json({ error: "Import not found" }, { status: 404 });
  return NextResponse.json({ job });
}
