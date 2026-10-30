export const STOP_CONTACT_STATUSES = ["replied", "interested", "unsubscribed", "bounced", "not_interested"] as const;

export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}

export type SendingWindow = { timezone: string; sendingStartHour: number; sendingEndHour: number; skipWeekends: boolean };

export function sendingWindowDelay(policy: SendingWindow, now = new Date()): number {
  if (!validTimezone(policy.timezone) || policy.sendingStartHour >= policy.sendingEndHour) throw new Error("Invalid campaign sending window");
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: policy.timezone, hour: "numeric", weekday: "short", hourCycle: "h23" });
  const allowed = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const day = parts.find((part) => part.type === "weekday")?.value;
    return !(policy.skipWeekends && (day === "Sat" || day === "Sun")) && hour >= policy.sendingStartHour && hour < policy.sendingEndHour;
  };
  if (allowed(now)) return 0;
  // UTC-minute iteration handles fractional offsets and DST transitions.
  let candidate = Math.ceil((now.getTime() + 1) / 60_000) * 60_000;
  for (let minute = 0; minute < 8 * 24 * 60; minute++, candidate += 60_000) {
    if (allowed(new Date(candidate))) return candidate - now.getTime();
  }
  throw new Error("No available sending window");
}

export function mailboxSendLimit(mailbox: { dailySendLimit: number; warmupEnabled: boolean; warmupStartPerDay: number; warmupRampPerDay: number; createdAt: Date }, now = new Date()) {
  if (!mailbox.warmupEnabled) return mailbox.dailySendLimit;
  const days = Math.max(0, Math.floor((now.getTime() - mailbox.createdAt.getTime()) / 86_400_000));
  return Math.min(mailbox.dailySendLimit, mailbox.warmupStartPerDay + days * mailbox.warmupRampPerDay);
}
