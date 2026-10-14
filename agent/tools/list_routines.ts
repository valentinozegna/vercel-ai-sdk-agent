import { defineTool } from "eve/tools";
import { z } from "zod";

import { describeRoutine, listRoutines } from "../lib/routines";

export default defineTool({
  description:
    "List your scheduled routines (reminders, follow-ups, recurring jobs) with their next run, last run, and status.",
  inputSchema: z.object({
    includeFinished: z
      .boolean()
      .optional()
      .describe("Also include disabled routines and one-time routines that already ran."),
  }),
  label: { start: () => "List routines" },
  async execute({ includeFinished }) {
    const routines = await listRoutines();
    const visible = includeFinished ? routines : routines.filter((r) => r.enabled);
    return { count: visible.length, routines: visible.map(describeRoutine) };
  },
});
