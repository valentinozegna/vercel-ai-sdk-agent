import path from "node:path";

/**
 * Runtime configuration, read lazily from the environment so values resolve
 * when the agent runs (not when eve compiles it).
 */

/** Where the agent keeps its own state: memory, routines, heartbeat, activity. */
export function dataDir(): string {
  return process.env.AGENT_DATA_DIR ?? path.resolve(process.cwd(), ".data");
}

/** The owner's IANA time zone. Schedules, routines, and the clock use it. */
export function ownerTimeZone(): string {
  return process.env.OWNER_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function ownerName(): string | undefined {
  return process.env.OWNER_NAME || undefined;
}

/** Telegram user IDs allowed to talk to the agent (comma-separated). */
export function telegramOwnerIds(): string[] {
  return (process.env.TELEGRAM_OWNER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Chat the agent uses for proactive messages (heartbeat, routines). In a
 * private chat the chat ID equals the user ID, so it defaults to the first owner.
 */
export function telegramOwnerChatId(): string | undefined {
  return process.env.TELEGRAM_OWNER_CHAT_ID || telegramOwnerIds()[0];
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && telegramOwnerChatId());
}

/** Minutes between heartbeats. 0 disables the heartbeat. */
export function heartbeatIntervalMinutes(): number {
  const raw = Number(process.env.HEARTBEAT_INTERVAL_MINUTES ?? 30);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30;
}

/**
 * Quiet hours in the owner's time zone as "start-end" (24h clock), e.g. "23-7".
 * The heartbeat stays silent inside the window. Routines still run, since the
 * owner scheduled them explicitly.
 */
export function quietHours(): { start: number; end: number } | null {
  const raw = process.env.QUIET_HOURS ?? "23-7";
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 23 || start === end) return null;
  return { start, end };
}

/** Current hour (0-23) in the owner's time zone. */
export function ownerHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: ownerTimeZone(),
  }).format(now);
  return Number(hour);
}

export function isQuietHour(now = new Date()): boolean {
  const window = quietHours();
  if (!window) return false;
  const hour = ownerHour(now);
  return window.start < window.end
    ? hour >= window.start && hour < window.end
    : hour >= window.start || hour < window.end;
}

/** Human-readable local time for prompts, e.g. "Tuesday, 13 October 2026, 14:05". */
export function formatOwnerTime(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: ownerTimeZone(),
  }).format(date);
}
