/**
 * Telegram long-polling bridge.
 *
 * eve's Telegram channel receives updates as webhooks. On a VM without a
 * public HTTPS URL, run this next to the agent instead: it pulls updates from
 * Telegram with getUpdates and forwards each one to the agent's local webhook
 * route, signed with the same secret token Telegram would send.
 *
 *   npm run telegram:poll
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, and optionally
 * AGENT_URL (default http://127.0.0.1:3000).
 */

export {};

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the process environment.
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
const agentUrl = (process.env.AGENT_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const webhookUrl = `${agentUrl}/eve/v1/telegram`;

if (!token || !secret) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN must be set.");
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Update {
  update_id: number;
}

async function telegram<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await response.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method} failed: ${json.description ?? response.status}`);
  return json.result;
}

/** Forwards one update; resolves only once the agent accepted it. */
async function forward(update: Update): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": secret!,
        },
        body: JSON.stringify(update),
      });
      if (response.ok) return;
      // A 4xx means the agent rejected this update for good; do not retry it forever.
      if (response.status >= 400 && response.status < 500) {
        console.warn(`agent rejected update ${update.update_id}: HTTP ${response.status}`);
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      const wait = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
      console.warn(`forwarding update ${update.update_id} failed (${String(error)}), retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log("stopping telegram poller");
    controller.abort();
  });
}

/** A rejected token is a configuration problem: retry slowly instead of hammering Telegram. */
function retryDelayFor(error: unknown): number {
  return /unauthorized|not found/i.test(String(error)) ? 60_000 : 5_000;
}

function describe(error: unknown): string {
  const text = String(error);
  return /unauthorized|not found/i.test(text)
    ? `${text}. Check TELEGRAM_BOT_TOKEN.`
    : text;
}

// getUpdates and a webhook are mutually exclusive in the Bot API.
while (!controller.signal.aborted) {
  try {
    await telegram("deleteWebhook", { drop_pending_updates: false }, controller.signal);
    break;
  } catch (error) {
    if (controller.signal.aborted) process.exit(0);
    const wait = retryDelayFor(error);
    console.error(`telegram poller cannot start: ${describe(error)} Retrying in ${wait / 1000}s.`);
    await sleep(wait);
  }
}
console.log(`telegram poller forwarding to ${webhookUrl}`);

let offset = 0;
while (!controller.signal.aborted) {
  try {
    const updates = await telegram<Update[]>(
      "getUpdates",
      { offset, timeout: 50, allowed_updates: ["message", "callback_query"] },
      controller.signal,
    );
    for (const update of updates) {
      await forward(update);
      // Advance only after the agent has the update, so a crash never drops one.
      offset = update.update_id + 1;
    }
  } catch (error) {
    if (controller.signal.aborted) break;
    const wait = retryDelayFor(error);
    console.warn(`getUpdates failed (${describe(error)}), retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}
