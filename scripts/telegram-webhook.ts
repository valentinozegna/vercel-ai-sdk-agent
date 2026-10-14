/**
 * Registers the agent's Telegram webhook, for deployments with a public HTTPS
 * URL (a VM behind Caddy or a tunnel, or Vercel). Stop the polling bridge
 * first: Telegram delivers through a webhook or getUpdates, not both.
 *
 *   PUBLIC_URL=https://agent.example.com npm run telegram:webhook
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, PUBLIC_URL.
 */

export {};

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the process environment.
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");

if (!token || !secret || !publicUrl) {
  console.error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, and PUBLIC_URL must be set.");
  process.exit(1);
}

const url = `${publicUrl}/eve/v1/telegram`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  }),
});
const result = (await response.json()) as { ok: boolean; description?: string };
console.log(result.ok ? `Webhook set to ${url}` : `setWebhook failed: ${result.description}`);
process.exit(result.ok ? 0 : 1);
