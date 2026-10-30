import { NextResponse } from "next/server";
import { recommendationInput, recommendOutreach } from "@mailpilot/shared/recommendations";
import { checkAiUsageLimit, PlanLimitError, recordAiUsage } from "@mailpilot/shared/billing";
import { isAiConfigured } from "@mailpilot/shared/ai";
import { checkRateLimit } from "@mailpilot/shared/rate-limit";
import { getCurrentAuth } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const input = recommendationInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0].message }, { status: 400 });
  const aiLimit = await checkRateLimit(`ai:${auth.workspace.id}`, 100, 3600);
  if (!aiLimit.allowed) return NextResponse.json({ error: "AI rate limit reached for this workspace. Try again later." }, { status: 429 });
  try {
    if (isAiConfigured()) {
      try { await checkAiUsageLimit(auth.workspace.id); } catch (error) { if (error instanceof PlanLimitError) return NextResponse.json({ error: error.message }, { status: 402 }); throw error; }
    }
    const result = await recommendOutreach(input.data);
    if (result.source === "ai") await recordAiUsage(auth.workspace.id, "recommendation");
    return NextResponse.json(result);
  }
  catch { return NextResponse.json({ error: "Unable to generate recommendations. Check your AI provider configuration or try again." }, { status: 502 }); }
}
