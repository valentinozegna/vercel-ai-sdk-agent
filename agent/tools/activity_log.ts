import { defineTool } from "eve/tools";
import { z } from "zod";

import { recentActivity } from "../lib/activity";

export default defineTool({
  description:
    "Read the log of what you did on your own (heartbeats, routine runs, routine changes), newest first. Use it to answer 'what have you been up to?'. For upcoming work, use list_routines.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).optional().describe("Defaults to 30"),
  }),
  label: { start: () => "Read activity log" },
  async execute({ limit }) {
    return { entries: await recentActivity(limit ?? 30) };
  },
});
