import { defineAgent, defineDynamic } from "eve";

import { modelSelection } from "./lib/models";

export default defineAgent({
  // Chosen at runtime from AGENT_MODEL or whichever credential is configured;
  // see agent/lib/models.ts. The same model serves every step, so prompt
  // caching keeps working.
  model: defineDynamic({
    events: {
      "step.started": () => modelSelection(process.env.AGENT_MODEL, "main"),
    },
  }),
  compaction: {
    // Long-lived chats (the Telegram DM is one session) compact a bit early.
    thresholdPercent: 0.8,
  },
  limits: {
    // A personal agent talks in one long session; cap what a runaway loop can spend.
    maxTokenCostUsdPerSession: 25,
    // Keep the main chat session alive; eve starts a fresh one after this.
    sessionTimeoutMs: 90 * 24 * 60 * 60 * 1_000,
  },
});
