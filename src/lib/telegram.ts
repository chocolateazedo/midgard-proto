import { Bot, type Api, type Context } from "grammy";

export type TelegramBotInfo = {
  id: number;
  isBot: boolean;
  firstName: string;
  username: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
  supportsInlineQueries: boolean;
};

class BotManager {
  private bots: Map<string, Bot> = new Map();

  async startBot(
    botId: string,
    token: string,
    webhookUrl: string
  ): Promise<void> {
    if (this.bots.has(botId)) {
      await this.stopBot(botId);
    }

    const bot = new Bot(token);
    this.bots.set(botId, bot);

    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
  }

  async stopBot(botId: string): Promise<void> {
    const bot = this.bots.get(botId);
    if (bot) {
      try {
        await bot.api.deleteWebhook();
      } catch {
        // Ignore errors when deleting webhook
      }
      this.bots.delete(botId);
    }
  }

  async restartBot(
    botId: string,
    token: string,
    webhookUrl: string
  ): Promise<void> {
    await this.stopBot(botId);
    await this.startBot(botId, token, webhookUrl);
  }

  async getBotInfo(token: string): Promise<TelegramBotInfo> {
    const bot = new Bot(token);
    const me = await bot.api.getMe();
    return {
      id: me.id,
      isBot: me.is_bot,
      firstName: me.first_name,
      username: me.username || "",
      canJoinGroups: me.can_join_groups || false,
      canReadAllGroupMessages: me.can_read_all_group_messages || false,
      supportsInlineQueries: me.supports_inline_queries || false,
    };
  }

  async setWebhook(token: string, webhookUrl: string): Promise<void> {
    const bot = new Bot(token);
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
  }

  async deleteWebhook(token: string): Promise<void> {
    const bot = new Bot(token);
    await bot.api.deleteWebhook();
  }

  async sendMessage(
    token: string,
    chatId: number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<void> {
    const bot = new Bot(token);
    await bot.api.sendMessage(chatId, text, options as any);
  }

  async sendPhoto(
    token: string,
    chatId: number,
    photoUrl: string,
    caption?: string
  ): Promise<void> {
    const bot = new Bot(token);
    await bot.api.sendPhoto(chatId, photoUrl, { caption });
  }

  async sendVideo(
    token: string,
    chatId: number,
    videoUrl: string,
    caption?: string
  ): Promise<void> {
    const bot = new Bot(token);
    await bot.api.sendVideo(chatId, videoUrl, { caption });
  }

  async sendDocument(
    token: string,
    chatId: number,
    documentUrl: string,
    caption?: string
  ): Promise<void> {
    const bot = new Bot(token);
    await bot.api.sendDocument(chatId, documentUrl, { caption });
  }

  getBot(botId: string): Bot | undefined {
    return this.bots.get(botId);
  }
}

export const botManager = new BotManager();
