import path from "node:path";
import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";

import { dataDir } from "./lib/config";
import { localDiskBackend } from "./lib/file-memory-backend";

/**
 * One memory shared by every channel and by the agent's own scheduled runs.
 * This is a single-owner agent: route auth and the Telegram allowlist decide
 * who can reach it, so the scope is a constant instead of the caller.
 *
 * Self-hosted, memory lives in AGENT_DATA_DIR/memory. On Vercel, eve's
 * default backend stores it in Vercel Blob (run `npx eve add memory/file`).
 */
export default defineMemory({
  description:
    "Long-term memory about the owner: durable facts, preferences, people, projects, and important dates.",
  provider: fileMemory({
    backend: process.env.VERCEL ? undefined : localDiskBackend(path.join(dataDir(), "memory")),
    maxCharacters: 8_000,
  }),
  scope: "owner",
});
