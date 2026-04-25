import { Bot, InputFile, type Api, type Context } from "grammy";
import { getObjectStream } from "@/lib/s3";

// Limite Telegram Bot API ao passar URL como string. Acima disso o
// Telegram retorna 400 "failed to get HTTP URL content". Usar stream
// multipart (InputFile) sobe esse limite pra 50 MB.
const URL_UPLOAD_MAX_BYTES = 18 * 1024 * 1024; // ~18 MB com folga abaixo dos 20 MB oficiais

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

  /**
   * Envia mídia do nosso storage ao Telegram. Decide entre URL (rápido,
   * limite 20 MB) e multipart stream (limite 50 MB) com base no tamanho
   * do objeto. Caller passa só a key — não precisa pré-gerar URL nem
   * baixar manualmente.
   *
   * Ainda há limite duro de 50 MB na Bot API global; arquivos maiores
   * caem em erro. A solução final é a variante leve via ffmpeg
   * (ver Content.lightKey + worker video-light-generator).
   */
  async sendMediaFromKey(
    token: string,
    chatId: number,
    args: {
      type: "image" | "video" | "file" | "bundle";
      key: string;
      caption?: string;
      options?: Record<string, unknown>;
    }
  ): Promise<void> {
    const { type, key, caption, options } = args;
    const bot = new Bot(token);

    // Photos são geralmente pequenas (< 5 MB). URL direto é mais leve
    // que multipart, e o limite Telegram pra photo via URL é 5 MB —
    // raramente um problema; mantemos URL.
    if (type === "image") {
      const { getPublicUrl } = await import("@/lib/s3");
      const url = await getPublicUrl(key);
      await bot.api.sendPhoto(chatId, url, { caption, ...options } as any);
      return;
    }

    // Pra video/document/bundle, decide pelo tamanho do objeto.
    const { stream, contentLength } = await getObjectStream(key);
    const filename = key.split("/").pop() || `file-${Date.now()}`;

    const useUrl = contentLength > 0 && contentLength <= URL_UPLOAD_MAX_BYTES;
    if (useUrl) {
      // Stream desnecessário — fechamos pra liberar conexão e usamos URL.
      try {
        (stream as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
      const { getPublicUrl } = await import("@/lib/s3");
      const url = await getPublicUrl(key);
      if (type === "video") {
        await bot.api.sendVideo(chatId, url, { caption });
      } else {
        await bot.api.sendDocument(chatId, url, { caption });
      }
      return;
    }

    // Stream multipart (até 50 MB). Acima disso a Bot API rejeita.
    const inputFile = new InputFile(stream as never, filename);
    if (type === "video") {
      await bot.api.sendVideo(chatId, inputFile, { caption });
    } else {
      await bot.api.sendDocument(chatId, inputFile, { caption });
    }
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
      Number(channelId),
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
    await bot.api.banChatMember(Number(channelId), Number(userId));
    await bot.api.unbanChatMember(Number(channelId), Number(userId), {
      only_if_banned: true,
    });
  }

  async getChat(
    token: string,
    chatId: bigint | number | string
  ): Promise<{ id: number; title?: string; username?: string; type: string }> {
    const bot = new Bot(token);
    const chat = await bot.api.getChat(Number(chatId));
    return {
      id: chat.id,
      title: "title" in chat ? chat.title : undefined,
      username: "username" in chat ? chat.username : undefined,
      type: chat.type,
    };
  }
}

export const botManager = new BotManager();
