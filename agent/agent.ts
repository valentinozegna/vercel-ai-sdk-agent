import { defineAgent } from "eve";

export default defineAgent({
  // Any AI Gateway model ID works. Change it with `npx eve set model <id>`.
  model: "anthropic/claude-opus-5.5",
  reasoning: "medium",
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
