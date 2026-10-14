import { defineTool } from "eve/tools";
import { z } from "zod";

import { heartbeatIntervalMinutes } from "../lib/config";
import { CHECKLIST_MAX_CHARS, readChecklist, writeChecklist } from "../lib/heartbeat";

export default defineTool({
  description: [
    "Read or replace your heartbeat checklist: the standing things you review every time you wake up on your own.",
    "Use it when the owner asks you to keep an eye on something ongoing.",
    "Keep it short; for something at a specific time, use create_routine instead.",
    "An empty checklist turns the heartbeat off.",
  ].join(" "),
  inputSchema: z.object({
    action: z.enum(["read", "replace"]),
    content: z
      .string()
      .max(CHECKLIST_MAX_CHARS)
      .optional()
      .describe("Full new checklist as a markdown list. Required for replace; read first and edit."),
  }),
  label: {
    start: ({ action }) => (action === "read" ? "Read heartbeat checklist" : "Update heartbeat checklist"),
  },
  async execute({ action, content }) {
    if (action === "replace") {
      if (content === undefined) throw new Error("content is required for replace.");
      await writeChecklist(content);
    }
    return {
      checklist: await readChecklist(),
      intervalMinutes: heartbeatIntervalMinutes(),
    };
  },
});
