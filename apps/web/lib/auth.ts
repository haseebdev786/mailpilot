import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthContext, SESSION_COOKIE_NAME } from "@mailpilot/shared/auth";
import { cache } from "react";

export const getCurrentAuth = cache(async () => {
  const cookieStore = await cookies();
  return getAuthContext(cookieStore.get(SESSION_COOKIE_NAME)?.value);
});

export async function requireAuth() {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");
  return auth;
}
