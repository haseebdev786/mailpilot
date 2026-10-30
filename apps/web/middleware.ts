import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isTrustedMutation } from "./lib/request-origin";

const SESSION_COOKIE_NAME = "webdev_app_session";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") && pathname !== "/api/unsubscribe" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!isTrustedMutation(request, process.env.APP_URL, process.env.NODE_ENV === "development")) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
  }
  const protectedRoute = ["/dashboard", "/campaigns", "/contacts", "/inbox", "/mailboxes", "/knowledge-base", "/analytics", "/settings"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (protectedRoute && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/dashboard/:path*", "/campaigns/:path*", "/contacts/:path*", "/inbox/:path*", "/mailboxes/:path*", "/knowledge-base/:path*", "/analytics/:path*", "/settings/:path*"] };
