import path from "node:path";

import { dataDir } from "./config";
import { appendLine, readText } from "./file-store";

/**
 * Append-only log of what the agent did on its own: heartbeats, routine runs,
 * and their outcomes. The owner can ask "what have you been up to?" and the
 * agent reads it back with the activity_log tool.
 */

export interface ActivityEntry {
  at: string;
  kind: "heartbeat" | "routine" | "routine-change";
  summary: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
}

function logFile(): string {
  return path.join(dataDir(), "activity.jsonl");
}

export async function logActivity(entry: Omit<ActivityEntry, "at">): Promise<void> {
  try {
    await appendLine(logFile(), JSON.stringify({ at: new Date().toISOString(), ...entry }));
  } catch (error) {
    // The log is informational; never fail a run because it could not be written.
    console.warn("activity log write failed", error);
  }
}

export async function recentActivity(limit: number): Promise<ActivityEntry[]> {
  const text = await readText(logFile());
  if (!text) return [];
  return text
    .trim()
    .split("\n")
    .slice(-limit)
    .map((line) => JSON.parse(line) as ActivityEntry)
    .reverse();
}
