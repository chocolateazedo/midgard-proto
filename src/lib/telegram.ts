import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
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

    // Detecta erros do Telegram quando ele falha em baixar uma URL externa
    // (Wasabi inconstante, presigned URL com edge case, etc). Sinal pra
    // re-tentar via multipart.
    const isUrlFetchError = (err: unknown): boolean => {
      const e = err as { description?: string; error_code?: number };
      if (e?.error_code !== 400) return false;
      const d = (e?.description ?? "").toLowerCase();
      return (
        d.includes("failed to get http url content") ||
        d.includes("wrong file identifier") ||
        d.includes("wrong url") ||
        d.includes("webhook can not be sent")
      );
    };

    // Photo > 10 MB: Telegram rejeita sendPhoto. Fallback sendDocument
    // (limite 50 MB) — chega como anexo em vez de preview, mas chega.
    const isPhotoTooBigError = (err: unknown): boolean => {
      const e = err as { description?: string; error_code?: number };
      if (e?.error_code !== 400) return false;
      const d = (e?.description ?? "").toLowerCase();
      return d.includes("too big for a photo") || d.includes("photo_save_file_invalid");
    };

    // Photos: tenta URL (rápido). Se Telegram falhar em baixar, fallback
    // pra multipart. Se photo > 10 MB, fallback pra sendDocument.
    if (type === "image") {
      const { getPublicUrl } = await import("@/lib/s3");
      try {
        const url = await getPublicUrl(key);
        await bot.api.sendPhoto(chatId, url, { caption, ...options } as any);
        return;
      } catch (err) {
        if (isPhotoTooBigError(err)) {
          console.warn(
            `[sendMediaFromKey] photo > 10MB, fallback to sendDocument: ${(err as Error).message}`,
          );
          await bot.api.sendDocument(
            chatId,
            await (await import("@/lib/s3")).getPublicUrl(key),
            { caption, ...options } as any,
          );
          return;
        }
        if (!isUrlFetchError(err)) throw err;
        console.warn(
          `[sendMediaFromKey] photo URL failed, falling back to multipart: ${(err as Error).message}`,
        );
      }
      // Fallback multipart pra image
      const { stream: imgStream } = await getObjectStream(key);
      const imgFilename =
        key.split("/").pop() || `photo-${Date.now()}.jpg`;
      const imgTmpPath = join(
        tmpdir(),
        `tg-${randomUUID()}-${imgFilename}`.replace(/[^A-Za-z0-9._-]/g, "_"),
      );
      try {
        await pipeline(imgStream, createWriteStream(imgTmpPath));
        const inputFile = new InputFile(createReadStream(imgTmpPath), imgFilename);
        try {
          await bot.api.sendPhoto(chatId, inputFile, { caption, ...options } as any);
        } catch (err) {
          if (!isPhotoTooBigError(err)) throw err;
          // Mesma tmp path serve pro sendDocument
          const inputFile2 = new InputFile(createReadStream(imgTmpPath), imgFilename);
          await bot.api.sendDocument(chatId, inputFile2, { caption, ...options } as any);
        }
      } finally {
        await unlink(imgTmpPath).catch(() => {});
      }
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
      try {
        if (type === "video") {
          await bot.api.sendVideo(chatId, url, { caption });
        } else {
          await bot.api.sendDocument(chatId, url, { caption });
        }
        return;
      } catch (err) {
        if (!isUrlFetchError(err)) throw err;
        console.warn(
          `[sendMediaFromKey] ${type} URL failed, falling back to multipart: ${(err as Error).message}`,
        );
        // Re-fetch stream pro fallback (o anterior foi destruído).
      }
    }

    // Stream multipart (até 50 MB). Acima disso a Bot API rejeita.
    //
    // IMPORTANTE: passar o stream do S3 SDK direto pro InputFile resulta
    // em "Network request for 'sendVideo' failed!" do Telegram em parte
    // dos casos (provavelmente conflito de timeout/lifecycle do stream
    // entre SDK e fetch interno do grammy). Workaround: baixar pra
    // arquivo temporário em disco e enviar como stream do disco.
    const fallbackStream = useUrl
      ? (await getObjectStream(key)).stream
      : stream;
    const tmpPath = join(
      tmpdir(),
      `tg-${randomUUID()}-${filename}`.replace(/[^A-Za-z0-9._-]/g, "_")
    );
    try {
      await pipeline(fallbackStream, createWriteStream(tmpPath));
      const inputFile = new InputFile(createReadStream(tmpPath), filename);
      if (type === "video") {
        await bot.api.sendVideo(chatId, inputFile, { caption });
      } else {
        await bot.api.sendDocument(chatId, inputFile, { caption });
      }
    } finally {
      await unlink(tmpPath).catch(() => {});
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
