import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Minimal durable storage on the local filesystem. The agent runs as one
 * process on one VM, so an in-process lock plus atomic renames is enough to
 * keep reads and writes consistent. Swap this module for Redis or Postgres when
 * running several instances.
 */

const locks = new Map<string, Promise<unknown>>();

/** Serializes async work per key inside this process. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const settled = run.catch(() => undefined);
  locks.set(key, settled);
  try {
    return await run;
  } finally {
    if (locks.get(key) === settled) locks.delete(key);
  }
}

export async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Writes through a temp file and rename so readers never see a partial file. */
export async function writeTextAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, file);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  const text = await readText(file);
  return text === null ? fallback : (JSON.parse(text) as T);
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendLine(file: string, line: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${line}\n`, "utf8");
}
