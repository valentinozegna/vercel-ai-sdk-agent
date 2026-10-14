import { createHash } from "node:crypto";
import path from "node:path";
import { MemoryDocumentConflictError, type MemoryDocumentBackend } from "eve/memory/file";

import { readText, withLock, writeTextAtomic } from "./file-store";

/**
 * Stores eve file-memory documents on local disk. eve ships in-memory and
 * Vercel Blob backends; a self-hosted VM needs a durable local one. Each scope
 * key maps to one markdown file, versioned by a hash of its content.
 */
export function localDiskBackend(directory: string): MemoryDocumentBackend {
  const fileFor = (key: string) =>
    path.join(directory, `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.md`);
  const versionOf = (content: string) => createHash("sha256").update(content).digest("hex");

  return {
    async read({ key }) {
      const content = await readText(fileFor(key));
      return content === null ? null : { content, version: versionOf(content) };
    },
    async write({ key, content, expectedVersion }) {
      const file = fileFor(key);
      return withLock(file, async () => {
        const current = await readText(file);
        const currentVersion = current === null ? null : versionOf(current);
        if (currentVersion !== expectedVersion) throw new MemoryDocumentConflictError(key);
        await writeTextAtomic(file, content);
        return { content, version: versionOf(content) };
      });
    },
  };
}
