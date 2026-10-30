import { NextResponse } from "next/server";
import { recommendationInput, recommendOutreach } from "@mailpilot/shared/recommendations";
import { getCurrentAuth } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const input = recommendationInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0].message }, { status: 400 });
  try { return NextResponse.json(await recommendOutreach(input.data)); }
  catch { return NextResponse.json({ error: "Unable to generate recommendations. Check your AI provider configuration or try again." }, { status: 502 }); }
}
