import path from "node:path";

import { dataDir } from "./config";
import { readJson, readText, withLock, writeJsonAtomic, writeTextAtomic } from "./file-store";

/**
 * The heartbeat checklist is a short markdown list of standing things the
 * agent should keep an eye on ("remind me to drink water", "check the status
 * page of X"). The heartbeat schedule reads it on every beat; an empty
 * checklist means the beat is skipped without calling the model.
 */

function checklistFile(): string {
  return path.join(dataDir(), "HEARTBEAT.md");
}

function stateFile(): string {
  return path.join(dataDir(), "heartbeat-state.json");
}

/** Maximum checklist size, to keep every heartbeat turn cheap. */
export const CHECKLIST_MAX_CHARS = 4_000;

export async function readChecklist(): Promise<string> {
  return ((await readText(checklistFile())) ?? "").trim();
}

export async function writeChecklist(content: string): Promise<string> {
  const trimmed = content.trim();
  if (trimmed.length > CHECKLIST_MAX_CHARS) {
    throw new Error(`The checklist is limited to ${CHECKLIST_MAX_CHARS} characters.`);
  }
  await withLock("heartbeat", () => writeTextAtomic(checklistFile(), `${trimmed}\n`));
  return trimmed;
}

/**
 * Returns true and records the beat when at least `intervalMinutes` passed
 * since the last one. The schedule fires more often than the interval so the
 * interval can change through the environment without a rebuild.
 */
export async function claimBeat(intervalMinutes: number, now = new Date()): Promise<boolean> {
  return withLock("heartbeat-state", async () => {
    const state = await readJson<{ lastBeatAt: string | null }>(stateFile(), { lastBeatAt: null });
    if (state.lastBeatAt) {
      const elapsed = now.getTime() - new Date(state.lastBeatAt).getTime();
      // One minute of slack so a 30-minute interval on a 15-minute cron is not skipped by jitter.
      if (elapsed < (intervalMinutes - 1) * 60_000) return false;
    }
    await writeJsonAtomic(stateFile(), { lastBeatAt: now.toISOString() });
    return true;
  });
}
