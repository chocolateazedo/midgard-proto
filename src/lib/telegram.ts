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
      // my_chat_member: captura quando bot é adicionado/removido como admin de canal
      // chat_member: capta entradas/saídas de assinantes no canal
      allowed_updates: [
        "message",
        "callback_query",
        "my_chat_member",
        "chat_member",
      ],
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
    caption?: string,
    options?: Record<string, unknown>
  ): Promise<void> {
    const bot = new Bot(token);
    await bot.api.sendPhoto(chatId, photoUrl, { caption, ...options } as any);
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

  // --- Canal ---

  async createChannelInviteLink(
    token: string,
    channelId: bigint | number,
    opts: { memberLimit?: number; expireDate?: Date; name?: string } = {}
  ): Promise<string> {
    const bot = new Bot(token);
    const res = await bot.api.createChatInviteLink(
      channelId as unknown as number,
      {
        member_limit: opts.memberLimit,
        expire_date: opts.expireDate
          ? Math.floor(opts.expireDate.getTime() / 1000)
          : undefined,
        name: opts.name,
      }
    );
    return res.invite_link;
  }

  /**
   * Remove usuário do canal. Telegram exige chamar ban+unban; sem o unban o
   * usuário fica banido pra sempre e não consegue re-entrar com novo invite.
   */
  async removeFromChannel(
    token: string,
    channelId: bigint | number,
    userId: bigint | number
  ): Promise<void> {
    const bot = new Bot(token);
    await bot.api.banChatMember(
      channelId as unknown as number,
      userId as unknown as number
    );
    await bot.api.unbanChatMember(
      channelId as unknown as number,
      userId as unknown as number,
      { only_if_banned: true }
    );
  }

  async getChat(
    token: string,
    chatId: bigint | number | string
  ): Promise<{ id: number; title?: string; username?: string; type: string }> {
    const bot = new Bot(token);
    const chat = await bot.api.getChat(chatId as unknown as number);
    return {
      id: chat.id,
      title: "title" in chat ? chat.title : undefined,
      username: "username" in chat ? chat.username : undefined,
      type: chat.type,
    };
  }
}

export const botManager = new BotManager();
