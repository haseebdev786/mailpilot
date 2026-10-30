import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@mailpilot/shared/auth";
import { consumeAuthToken } from "@mailpilot/shared/auth-tokens";
import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(128) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const userId = await consumeAuthToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // A password reset invalidates every existing session.
    prisma.session.deleteMany({ where: { userId } })
  ]);
  logger.info("password_reset_completed", { userId });
  return NextResponse.json({ ok: true });
}
