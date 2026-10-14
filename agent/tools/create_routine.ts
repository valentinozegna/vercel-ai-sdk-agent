import { defineTool } from "eve/tools";
import { z } from "zod";

import { logActivity } from "../lib/activity";
import { createRoutine, describeRoutine } from "../lib/routines";

export default defineTool({
  description: [
    "Schedule work for yourself: a one-time reminder or follow-up, or a recurring job such as a morning briefing.",
    "When it fires, you receive `prompt` as a new task and your reply is sent to the owner on Telegram.",
    "Give exactly one of `runAt` (one-time) or `cron` (recurring, 5 fields, minute granularity, at least 5 minutes apart).",
    "Write `prompt` as a complete instruction to your future self, including any context it will need.",
  ].join(" "),
  inputSchema: z
    .object({
      title: z.string().min(1).max(120).describe("Short name, e.g. 'Morning briefing'"),
      prompt: z
        .string()
        .min(1)
        .max(8_000)
        .describe("What to do when the routine fires, e.g. 'Remind the owner to call the dentist.'"),
      runAt: z.iso
        .datetime({ offset: true })
        .optional()
        .describe("One-time run, ISO 8601 with an explicit UTC offset, e.g. 2026-10-14T09:00:00+02:00"),
      cron: z
        .string()
        .optional()
        .describe('Recurring run as a cron expression in `timeZone`, e.g. "0 8 * * 1-5" for 08:00 on weekdays'),
      timeZone: z
        .string()
        .optional()
        .describe("IANA time zone for `cron`. Defaults to the owner's time zone."),
    })
    .refine((input) => (input.runAt === undefined) !== (input.cron === undefined), {
      message: "Provide exactly one of runAt or cron.",
    }),
  label: {
    start: ({ title }) => `Schedule "${title}"`,
  },
  async execute({ title, prompt, runAt, cron, timeZone }) {
    const routine = await createRoutine({
      title,
      prompt,
      schedule: runAt ? { kind: "once", at: runAt } : { kind: "cron", cron: cron! },
      timeZone,
    });
    await logActivity({ kind: "routine-change", status: "ok", summary: `Created "${title}"` });
    return describeRoutine(routine);
  },
});
