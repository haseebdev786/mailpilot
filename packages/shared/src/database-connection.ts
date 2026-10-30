export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { return raw; }
  const isNeon = url.hostname.endsWith(".neon.tech");
  if (isNeon) {
    url.searchParams.delete("channel_binding");
    // Bound each process's pool and give cold connections enough time to open.
    const defaults = { sslmode: "require", connection_limit: "5", pool_timeout: "30", connect_timeout: "20", max_idle_connection_lifetime: "60" };
    for (const [key, value] of Object.entries(defaults)) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "15");
  if (url.hostname.includes("-pooler") && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
  return url.toString();
}
