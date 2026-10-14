import { defineSchedule } from "eve/schedules";

import telegram from "../channels/telegram";
import { logActivity } from "../lib/activity";
import {
  formatOwnerTime,
  heartbeatIntervalMinutes,
  isQuietHour,
  telegramConfigured,
  telegramOwnerChatId,
} from "../lib/config";
import { claimBeat, readChecklist } from "../lib/heartbeat";

/**
 * The heartbeat wakes the agent on its own so it can act without being asked.
 *
 * The cron ticks every 5 minutes but each tick is cheap: no model call happens
 * unless HEARTBEAT_INTERVAL_MINUTES elapsed, it is outside QUIET_HOURS, and the
 * checklist has something on it. The beat runs in the owner's Telegram chat so
 * the agent shares context with the conversation and can simply reply.
 */
export default defineSchedule({
  cron: "*/5 * * * *",
  run({ to, waitUntil, appAuth }) {
    waitUntil(
      (async () => {
        const interval = heartbeatIntervalMinutes();
        if (interval === 0 || !telegramConfigured() || isQuietHour()) return;

        const checklist = await readChecklist();
        if (!checklist) return;
        if (!(await claimBeat(interval))) return;

        const prompt = [
          `[heartbeat] ${formatOwnerTime()}`,
          "",
          "Review your heartbeat checklist and do whatever it calls for right now:",
          "",
          checklist,
          "",
          "If something deserves your owner's attention, send one short message about it.",
          "If nothing does, call no_reply. Do not message just to say all is well.",
        ].join("\n");

        try {
          await to(telegram, { chatId: telegramOwnerChatId()! }).send(prompt, { auth: appAuth });
          await logActivity({ kind: "heartbeat", status: "ok", summary: "Heartbeat dispatched" });
        } catch (error) {
          console.error("heartbeat dispatch failed", error);
          await logActivity({
            kind: "heartbeat",
            status: "error",
            summary: "Heartbeat dispatch failed",
            detail: String(error),
          });
        }
      })(),
    );
  },
});
