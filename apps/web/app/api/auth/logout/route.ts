import { NextResponse } from "next/server";
import { clearCookieOptions, deleteSession, SESSION_COOKIE_NAME } from "@mailpilot/shared/auth";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))?.split("=").slice(1).join("=");
  await deleteSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...clearCookieOptions(request), maxAge: 0 });
  return response;
}
