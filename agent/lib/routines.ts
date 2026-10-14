import path from "node:path";
import { randomUUID } from "node:crypto";
import { Cron } from "croner";

import { dataDir, ownerTimeZone } from "./config";
import { readJson, withLock, writeJsonAtomic } from "./file-store";

/**
 * Routines are the agent's own scheduled work: one-time reminders and
 * follow-ups, and recurring jobs such as a morning briefing. A single
 * once-a-minute dispatcher schedule (agent/schedules/routines.ts) claims due
 * routines and runs each one as a normal agent turn.
 */

export type RoutineSchedule =
  | { kind: "once"; at: string }
  | { kind: "cron"; cron: string };

export interface Routine {
  id: string;
  title: string;
  prompt: string;
  schedule: RoutineSchedule;
  timeZone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  runCount: number;
  leaseUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Recurring routines may not fire more often than this. */
export const MIN_INTERVAL_MINUTES = 5;

const LOCK = "routines";

function storeFile(): string {
  return path.join(dataDir(), "routines.json");
}

async function load(): Promise<Routine[]> {
  return readJson<Routine[]>(storeFile(), []);
}

async function save(routines: Routine[]): Promise<void> {
  await writeJsonAtomic(storeFile(), routines);
}

/** Validates a schedule and returns its first run strictly after `after`. */
export function nextRunFor(
  schedule: RoutineSchedule,
  timeZone: string,
  after: Date = new Date(),
): Date | null {
  if (schedule.kind === "once") {
    const at = new Date(schedule.at);
    if (Number.isNaN(at.getTime())) throw new Error(`Invalid date: ${schedule.at}`);
    return at > after ? at : null;
  }
  const cron = new Cron(schedule.cron, { timezone: timeZone, paused: true });
  return cron.nextRun(after);
}

function assertValidSchedule(schedule: RoutineSchedule, timeZone: string): Date {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`Unknown time zone: ${timeZone}`);
  }

  const first = nextRunFor(schedule, timeZone);
  if (!first) {
    throw new Error(
      schedule.kind === "once"
        ? `The time ${schedule.at} is in the past.`
        : `The cron expression "${schedule.cron}" never fires.`,
    );
  }

  if (schedule.kind === "cron") {
    const second = nextRunFor(schedule, timeZone, first);
    if (second && second.getTime() - first.getTime() < MIN_INTERVAL_MINUTES * 60_000) {
      throw new Error(
        `Recurring routines must be at least ${MIN_INTERVAL_MINUTES} minutes apart.`,
      );
    }
  }
  return first;
}

export async function createRoutine(input: {
  title: string;
  prompt: string;
  schedule: RoutineSchedule;
  timeZone?: string;
}): Promise<Routine> {
  const timeZone = input.timeZone || ownerTimeZone();
  const first = assertValidSchedule(input.schedule, timeZone);
  const now = new Date().toISOString();

  return withLock(LOCK, async () => {
    const routines = await load();
    const routine: Routine = {
      id: randomUUID(),
      title: input.title,
      prompt: input.prompt,
      schedule: input.schedule,
      timeZone,
      enabled: true,
      nextRunAt: first.toISOString(),
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      runCount: 0,
      leaseUntil: null,
      createdAt: now,
      updatedAt: now,
    };
    routines.push(routine);
    await save(routines);
    return routine;
  });
}

export async function listRoutines(): Promise<Routine[]> {
  const routines = await load();
  return routines.sort((a, b) =>
    (a.nextRunAt ?? "9999").localeCompare(b.nextRunAt ?? "9999"),
  );
}

export async function updateRoutine(
  id: string,
  patch: {
    title?: string;
    prompt?: string;
    schedule?: RoutineSchedule;
    timeZone?: string;
    enabled?: boolean;
  },
): Promise<Routine> {
  return withLock(LOCK, async () => {
    const routines = await load();
    const routine = routines.find((r) => r.id === id);
    if (!routine) throw new Error(`No routine with id ${id}.`);

    if (patch.title !== undefined) routine.title = patch.title;
    if (patch.prompt !== undefined) routine.prompt = patch.prompt;
    if (patch.enabled !== undefined) routine.enabled = patch.enabled;

    const scheduleChanged = patch.schedule !== undefined || patch.timeZone !== undefined;
    if (patch.schedule !== undefined) routine.schedule = patch.schedule;
    if (patch.timeZone !== undefined) routine.timeZone = patch.timeZone;

    if (scheduleChanged || (patch.enabled === true && !routine.nextRunAt)) {
      routine.nextRunAt = assertValidSchedule(routine.schedule, routine.timeZone).toISOString();
    }

    routine.updatedAt = new Date().toISOString();
    await save(routines);
    return routine;
  });
}

export async function deleteRoutine(id: string): Promise<boolean> {
  return withLock(LOCK, async () => {
    const routines = await load();
    const remaining = routines.filter((r) => r.id !== id);
    if (remaining.length === routines.length) return false;
    await save(remaining);
    return true;
  });
}

/**
 * Atomically leases routines that are due. A lease keeps overlapping
 * dispatcher ticks from running the same routine twice; an expired lease makes
 * the routine claimable again after a crash.
 */
export async function claimDueRoutines(options: {
  now?: Date;
  limit?: number;
  leaseForMs?: number;
}): Promise<Routine[]> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const leaseUntil = new Date(now.getTime() + (options.leaseForMs ?? 5 * 60_000));

  return withLock(LOCK, async () => {
    const routines = await load();
    const due = routines
      .filter(
        (r) =>
          r.enabled &&
          r.nextRunAt !== null &&
          new Date(r.nextRunAt) <= now &&
          (r.leaseUntil === null || new Date(r.leaseUntil) <= now),
      )
      .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!))
      .slice(0, limit);

    if (due.length === 0) return [];
    for (const routine of due) routine.leaseUntil = leaseUntil.toISOString();
    await save(routines);
    return due.map((r) => ({ ...r }));
  });
}

/** Compact, model-friendly view of a routine with times in its own time zone. */
export function describeRoutine(routine: Routine) {
  const local = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: routine.timeZone,
        }).format(new Date(iso))
      : null;
  return {
    id: routine.id,
    title: routine.title,
    prompt: routine.prompt,
    schedule:
      routine.schedule.kind === "once"
        ? `once at ${local(routine.schedule.at)}`
        : `cron "${routine.schedule.cron}"`,
    timeZone: routine.timeZone,
    enabled: routine.enabled,
    nextRun: local(routine.nextRunAt),
    lastRun: local(routine.lastRunAt),
    lastStatus: routine.lastStatus,
    lastError: routine.lastError,
    runCount: routine.runCount,
  };
}

/** Records a run and advances the routine to its next occurrence. */
export async function completeRoutine(
  id: string,
  result: { ok: true } | { ok: false; error: string; retryAt?: Date },
): Promise<void> {
  await withLock(LOCK, async () => {
    const routines = await load();
    const routine = routines.find((r) => r.id === id);
    if (!routine) return;

    const now = new Date();
    routine.leaseUntil = null;
    routine.lastRunAt = now.toISOString();
    routine.updatedAt = now.toISOString();

    if (!result.ok && result.retryAt) {
      routine.lastStatus = "error";
      routine.lastError = result.error;
      routine.nextRunAt = result.retryAt.toISOString();
    } else {
      routine.lastStatus = result.ok ? "ok" : "error";
      routine.lastError = result.ok ? null : result.error;
      routine.runCount += 1;
      const next =
        routine.schedule.kind === "once"
          ? null
          : nextRunFor(routine.schedule, routine.timeZone, now);
      routine.nextRunAt = next ? next.toISOString() : null;
      if (!next) routine.enabled = false;
    }

    await save(routines);
  });
}
