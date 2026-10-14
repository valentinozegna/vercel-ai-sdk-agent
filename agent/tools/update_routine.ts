import { defineTool } from "eve/tools";
import { z } from "zod";

import { logActivity } from "../lib/activity";
import { describeRoutine, updateRoutine } from "../lib/routines";

export default defineTool({
  description:
    "Change, pause, or resume one of your routines. Only the fields you pass change. Pass `runAt` or `cron` to reschedule.",
  inputSchema: z
    .object({
      id: z.string().uuid(),
      title: z.string().min(1).max(120).optional(),
      prompt: z.string().min(1).max(8_000).optional(),
      runAt: z.iso.datetime({ offset: true }).optional(),
      cron: z.string().optional(),
      timeZone: z.string().optional(),
      enabled: z.boolean().optional().describe("false pauses the routine, true resumes it"),
    })
    .refine((input) => !(input.runAt && input.cron), {
      message: "Pass runAt or cron, not both.",
    }),
  label: { start: () => "Update routine" },
  async execute({ id, runAt, cron, ...patch }) {
    const routine = await updateRoutine(id, {
      ...patch,
      ...(runAt ? { schedule: { kind: "once" as const, at: runAt } } : {}),
      ...(cron ? { schedule: { kind: "cron" as const, cron } } : {}),
    });
    await logActivity({
      kind: "routine-change",
      status: "ok",
      summary: `Updated "${routine.title}"`,
    });
    return describeRoutine(routine);
  },
});
