import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { MemoryDocumentConflictError } from "eve/memory/file";

import { isQuietHour } from "../agent/lib/config";
import { localDiskBackend } from "../agent/lib/file-memory-backend";
import { claimBeat, readChecklist, writeChecklist } from "../agent/lib/heartbeat";
import {
  claimDueRoutines,
  completeRoutine,
  createRoutine,
  deleteRoutine,
  listRoutines,
  nextRunFor,
  updateRoutine,
} from "../agent/lib/routines";

let dir: string;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "agent-test-"));
  process.env.OWNER_TIMEZONE = "Europe/Rome";
});

beforeEach(async () => {
  process.env.AGENT_DATA_DIR = await mkdtemp(path.join(dir, "data-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("routines", () => {
  it("computes cron runs in the routine's time zone", () => {
    const after = new Date("2026-10-13T12:00:00Z");
    const next = nextRunFor({ kind: "cron", cron: "0 8 * * *" }, "Europe/Rome", after);
    // 08:00 in Rome on 14 Oct 2026 is 06:00 UTC (CEST, UTC+2).
    assert.equal(next?.toISOString(), "2026-10-14T06:00:00.000Z");
  });

  it("rejects past one-time runs, bad cron, and too-frequent routines", async () => {
    await assert.rejects(
      createRoutine({ title: "t", prompt: "p", schedule: { kind: "once", at: "2001-01-01T00:00:00Z" } }),
      /in the past/,
    );
    await assert.rejects(
      createRoutine({ title: "t", prompt: "p", schedule: { kind: "cron", cron: "not a cron" } }),
    );
    await assert.rejects(
      createRoutine({ title: "t", prompt: "p", schedule: { kind: "cron", cron: "* * * * *" } }),
      /at least 5 minutes/,
    );
    await assert.rejects(
      createRoutine({ title: "t", prompt: "p", schedule: { kind: "cron", cron: "0 8 * * *" }, timeZone: "Mars/Base" }),
      /Unknown time zone/,
    );
  });

  it("claims due routines once, leases them, and finishes one-time routines", async () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    const routine = await createRoutine({ title: "Call mom", prompt: "Remind", schedule: { kind: "once", at: soon } });

    assert.deepEqual(await claimDueRoutines({ now: new Date() }), [], "not due yet");

    const later = new Date(Date.now() + 2 * 60_000);
    const [claimed] = await claimDueRoutines({ now: later });
    assert.equal(claimed.id, routine.id);
    assert.deepEqual(await claimDueRoutines({ now: later }), [], "leased routine is not claimed twice");

    await completeRoutine(routine.id, { ok: true });
    const [done] = await listRoutines();
    assert.equal(done.enabled, false);
    assert.equal(done.nextRunAt, null);
    assert.equal(done.runCount, 1);
    assert.equal(done.lastStatus, "ok");
  });

  it("reclaims a routine after its lease expires", async () => {
    const soon = new Date(Date.now() + 1_000).toISOString();
    await createRoutine({ title: "x", prompt: "p", schedule: { kind: "once", at: soon } });
    const t1 = new Date(Date.now() + 10_000);
    assert.equal((await claimDueRoutines({ now: t1, leaseForMs: 60_000 })).length, 1);
    const t2 = new Date(t1.getTime() + 61_000);
    assert.equal((await claimDueRoutines({ now: t2 })).length, 1, "expired lease is claimable");
  });

  it("advances recurring routines and schedules retries on failure", async () => {
    const routine = await createRoutine({ title: "Brief", prompt: "p", schedule: { kind: "cron", cron: "0 8 * * *" } });
    const firstNext = routine.nextRunAt!;

    await completeRoutine(routine.id, { ok: false, error: "boom", retryAt: new Date(Date.now() + 300_000) });
    let [r] = await listRoutines();
    assert.equal(r.lastStatus, "error");
    assert.equal(r.runCount, 0, "a retry does not count as a run");
    assert.ok(new Date(r.nextRunAt!) < new Date(firstNext) || r.nextRunAt !== firstNext);

    await completeRoutine(routine.id, { ok: true });
    [r] = await listRoutines();
    assert.equal(r.enabled, true);
    assert.equal(r.runCount, 1);
    assert.ok(new Date(r.nextRunAt!) > new Date());
  });

  it("updates, pauses, and deletes", async () => {
    const routine = await createRoutine({ title: "a", prompt: "p", schedule: { kind: "cron", cron: "0 9 * * 1" } });
    const paused = await updateRoutine(routine.id, { enabled: false, title: "b" });
    assert.equal(paused.enabled, false);
    assert.equal(paused.title, "b");
    assert.equal(await deleteRoutine(routine.id), true);
    assert.equal(await deleteRoutine(routine.id), false);
  });
});

describe("heartbeat", () => {
  it("stores the checklist and rate-limits beats", async () => {
    assert.equal(await readChecklist(), "");
    await writeChecklist("- check the build\n");
    assert.equal(await readChecklist(), "- check the build");

    const t0 = new Date("2026-10-13T10:00:00Z");
    assert.equal(await claimBeat(30, t0), true);
    assert.equal(await claimBeat(30, new Date(t0.getTime() + 10 * 60_000)), false);
    assert.equal(await claimBeat(30, new Date(t0.getTime() + 30 * 60_000)), true);
  });

  it("detects quiet hours across midnight in the owner's zone", () => {
    process.env.QUIET_HOURS = "23-7";
    // 23:30 and 06:59 in Rome (UTC+2 in October) are quiet; 12:00 is not.
    assert.equal(isQuietHour(new Date("2026-10-13T21:30:00Z")), true);
    assert.equal(isQuietHour(new Date("2026-10-14T04:59:00Z")), true);
    assert.equal(isQuietHour(new Date("2026-10-13T10:00:00Z")), false);
  });
});

describe("file memory backend", () => {
  it("creates, reads, and rejects stale writes", async () => {
    const backend = localDiskBackend(path.join(process.env.AGENT_DATA_DIR!, "memory"));
    const signal = new AbortController().signal;
    const key = "scope/owner";

    assert.equal(await backend.read({ key, signal }), null);
    const v1 = await backend.write({ key, signal, content: "- likes espresso", expectedVersion: null });
    assert.equal((await backend.read({ key, signal }))?.content, "- likes espresso");

    await assert.rejects(
      backend.write({ key, signal, content: "x", expectedVersion: null }),
      (error) => MemoryDocumentConflictError.is(error),
    );
    const v2 = await backend.write({ key, signal, content: "- likes espresso\n- runs on Sundays", expectedVersion: v1.version });
    assert.notEqual(v2.version, v1.version);
    await assert.rejects(
      backend.write({ key, signal, content: "y", expectedVersion: v1.version }),
      (error) => MemoryDocumentConflictError.is(error),
    );
  });
});
