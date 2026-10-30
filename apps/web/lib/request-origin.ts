// Development may be accessed through localhost, loopback, or a LAN hostname.
// Only accept that alternate origin when it is the actual request destination.
export function isTrustedMutation(request: Request, appUrl: string | undefined, development: boolean): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const destination = new URL(request.url);
    if (origin === new URL(appUrl || request.url).origin) return true;
    if (!development) return false;
    const host = request.headers.get("host");
    if (host) destination.host = host;
    return origin === destination.origin;
  } catch { return false; }
}
