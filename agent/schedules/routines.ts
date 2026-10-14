import { defineSchedule } from "eve/schedules";

import telegram from "../channels/telegram";
import { logActivity } from "../lib/activity";
import { formatOwnerTime, telegramConfigured, telegramOwnerChatId } from "../lib/config";
import { claimDueRoutines, completeRoutine } from "../lib/routines";

const RETRY_AFTER_MS = 5 * 60_000;

/**
 * Dispatcher for the routines the agent creates with create_routine. Every
 * minute it leases due routines and runs each one as an agent turn in the
 * owner's Telegram chat, where the agent's reply lands as a message.
 *
 * Delivery is at least once: a crash between dispatch and completion can run
 * a routine again after its lease expires.
 */
export default defineSchedule({
  cron: "* * * * *",
  run({ to, waitUntil, appAuth }) {
    waitUntil(
      (async () => {
        if (!telegramConfigured()) return;

        const due = await claimDueRoutines({ limit: 10, leaseForMs: RETRY_AFTER_MS });
        await Promise.all(
          due.map(async (routine) => {
            const prompt = [
              `[routine] ${routine.title}`,
              `Scheduled routine ${routine.id}, firing at ${formatOwnerTime()}.`,
              "",
              routine.prompt,
              "",
              "Do the task, then reply to your owner with the result. If there is nothing worth sending, call no_reply.",
            ].join("\n");

            try {
              await to(telegram, { chatId: telegramOwnerChatId()! }).send(prompt, {
                auth: appAuth,
              });
              await completeRoutine(routine.id, { ok: true });
              await logActivity({
                kind: "routine",
                status: "ok",
                summary: `Ran "${routine.title}"`,
              });
            } catch (error) {
              console.error(`routine ${routine.id} dispatch failed`, error);
              await completeRoutine(routine.id, {
                ok: false,
                error: String(error),
                retryAt: new Date(Date.now() + RETRY_AFTER_MS),
              });
              await logActivity({
                kind: "routine",
                status: "error",
                summary: `Failed to run "${routine.title}", retrying in 5 minutes`,
                detail: String(error),
              });
            }
          }),
        );
      })(),
    );
  },
});
