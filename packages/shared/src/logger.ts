const SECRET_KEY = /(pass(word)?|secret|token|key|authorization|cookie|database_url|redis_url|smtp|imap|oauth|api[-_]?key)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : sanitize(entry)]));
  }
  return typeof value === "string" && SECRET_KEY.test(value) ? "[REDACTED]" : value;
}

function write(level: "info" | "warn" | "error", message: string, context?: Record<string, unknown>) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...(context ? { context: sanitize(context) } : {}) };
  console[level](JSON.stringify(entry));
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context)
};
