import { defaultTelegramAuth, telegramChannel } from "eve/channels/telegram";

import { telegramOwnerIds } from "../lib/config";

/**
 * Telegram is the agent's main surface. Only the owner's private chat gets
 * through: messages from anyone else, and from groups, are dropped before
 * any model work runs.
 *
 * Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, and
 * TELEGRAM_OWNER_IDS. Deliver updates either with the polling bridge
 * (`npm run telegram:poll`, no public URL) or a registered webhook.
 */
export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME || undefined,
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf", "text/*"],
    maxBytes: 10 * 1024 * 1024,
  },
  async onMessage(ctx, message) {
    const sender = message.from;
    if (message.chat.type !== "private" || !sender || sender.isBot) return null;
    if (!telegramOwnerIds().includes(sender.id)) {
      console.warn(`telegram: ignored message from non-owner user ${sender.id}`);
      return null;
    }
    if (!message.text.trim() && !message.caption.trim() && message.attachments.length === 0) {
      return null;
    }

    await ctx.telegram.startTyping();
    return { auth: defaultTelegramAuth(message) };
  },
});
