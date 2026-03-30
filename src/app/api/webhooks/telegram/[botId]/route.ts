import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bots, content, botUsers, purchases } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { botManager } from "@/lib/telegram";
import { getPixProvider } from "@/lib/pix";
import { getPublicUrl } from "@/lib/s3";
import { formatCurrency } from "@/lib/utils";

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

async function upsertBotUser(
  botId: string,
  telegramUser: TelegramUser
): Promise<string> {
  const telegramUserId = BigInt(telegramUser.id);

  const existing = await db.query.botUsers.findFirst({
    where: and(
      eq(botUsers.botId, botId),
      eq(botUsers.telegramUserId, telegramUserId)
    ),
  });

  if (existing) {
    await db
      .update(botUsers)
      .set({ lastSeenAt: new Date() })
      .where(eq(botUsers.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(botUsers)
    .values({
      botId,
      telegramUserId,
      telegramUsername: telegramUser.username,
      telegramFirstName: telegramUser.first_name,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning({ id: botUsers.id });

  // Increment totalSubscribers on the bot
  await db
    .update(bots)
    .set({
      totalSubscribers: db
        .$count(botUsers, eq(botUsers.botId, botId)) as unknown as number,
    })
    .where(eq(bots.id, botId));

  return created.id;
}

async function sendCatalog(
  token: string,
  chatId: number,
  botId: string,
  welcomeMessage?: string | null
): Promise<void> {
  const publishedContent = await db.query.content.findMany({
    where: and(eq(content.botId, botId), eq(content.isPublished, true)),
  });

  const greeting =
    welcomeMessage ||
    "Bem-vindo! Confira os conteúdos disponíveis abaixo 👇";

  if (publishedContent.length === 0) {
    await botManager.sendMessage(token, chatId, `${greeting}\n\nNenhum conteúdo disponível no momento.`);
    return;
  }

  // Build inline keyboard
  const inlineKeyboard = publishedContent.map((item) => [
    {
      text: `${item.title} — ${formatCurrency(parseFloat(item.price))}`,
      callback_data: `buy_${item.id}`,
    },
  ]);

  const catalogText = publishedContent
    .map(
      (item, index) =>
        `${index + 1}. *${item.title}*\n${item.description ? `${item.description}\n` : ""}💰 ${formatCurrency(parseFloat(item.price))}`
    )
    .join("\n\n");

  await botManager.sendMessage(
    token,
    chatId,
    `${greeting}\n\n${catalogText}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    }
  );
}

async function handleBuyCallback(
  token: string,
  chatId: number,
  callbackQueryId: string,
  telegramUser: TelegramUser,
  contentId: string,
  botId: string,
  botUserId: string
): Promise<void> {
  // Load content with creator info
  const contentItem = await db.query.content.findFirst({
    where: and(eq(content.id, contentId), eq(content.botId, botId)),
    with: {
      bot: {
        with: {
          user: {
            columns: {
              id: true,
              platformFeePercent: true,
            },
          },
        },
      },
    },
  });

  if (!contentItem || !contentItem.isPublished) {
    await botManager.sendMessage(
      token,
      chatId,
      "Conteúdo não encontrado ou não disponível."
    );
    return;
  }

  const amount = parseFloat(contentItem.price);
  const feePercent = parseFloat(
    contentItem.bot.user.platformFeePercent ?? "10.00"
  );
  const platformFee = parseFloat(((amount * feePercent) / 100).toFixed(2));
  const creatorNet = parseFloat((amount - platformFee).toFixed(2));

  // Create charge via Pix provider
  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    amount,
    `Compra: ${contentItem.title}`
  );

  // Persist purchase record
  const expiresAt = charge.expiresAt;

  const [purchase] = await db
    .insert(purchases)
    .values({
      contentId,
      botId,
      botUserId,
      creatorUserId: contentItem.bot.user.id,
      amount: amount.toFixed(2),
      platformFee: platformFee.toFixed(2),
      creatorNet: creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
      status: "pending",
      expiresAt,
    })
    .returning({ id: purchases.id });

  const formattedAmount = formatCurrency(amount);
  const message =
    `🛒 *${contentItem.title}*\n\n` +
    `💰 Valor: *${formattedAmount}*\n\n` +
    `Para pagar, use o Pix Copia e Cola abaixo ou escaneie o QR Code:\n\n` +
    `\`${charge.copyPaste}\`\n\n` +
    `⏰ Este pagamento expira em *30 minutos*.\n` +
    `Após a confirmação, você receberá o conteúdo automaticamente.`;

  await botManager.sendMessage(token, chatId, message, {
    parse_mode: "Markdown",
  });

  // Send QR code image if available
  if (charge.qrCode && charge.qrCode.startsWith("data:image")) {
    // base64 QR code — send as photo via Buffer
    const base64Data = charge.qrCode.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const Bot = (await import("grammy")).Bot;
    const tempBot = new Bot(token);
    await tempBot.api.sendPhoto(chatId, new Blob([buffer], { type: "image/png" }) as any, {
      caption: "QR Code Pix",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
): Promise<NextResponse> {
  const { botId } = await params;

  try {
    // Load and validate bot
    const bot = await db.query.bots.findFirst({
      where: eq(bots.id, botId),
    });

    if (!bot || !bot.isActive) {
      return NextResponse.json({ success: false, error: "Bot not found or inactive" }, { status: 404 });
    }

    const token = decrypt(bot.telegramToken);

    // Parse Telegram update
    const update: TelegramUpdate = await request.json();

    // Handle message updates
    if (update.message) {
      const message = update.message;
      const from = message.from;
      if (!from) {
        return NextResponse.json({ success: true });
      }

      const chatId = message.chat.id;
      const text = message.text || "";

      // Upsert bot user
      const botUserId = await upsertBotUser(botId, from);

      if (text === "/start" || text.startsWith("/start ")) {
        await sendCatalog(token, chatId, botId, bot.description);
      } else if (text === "/catalog") {
        await sendCatalog(token, chatId, botId, "Aqui está o catálogo de conteúdos:");
      } else {
        // Default response
        await botManager.sendMessage(
          token,
          chatId,
          "Use /catalog para ver os conteúdos disponíveis."
        );
      }
    }

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const from = callbackQuery.from;
      const chatId = callbackQuery.message?.chat.id;
      const data = callbackQuery.data || "";

      if (!chatId) {
        return NextResponse.json({ success: true });
      }

      // Upsert bot user
      const botUserId = await upsertBotUser(botId, from);

      if (data.startsWith("buy_")) {
        const contentId = data.replace("buy_", "");
        await handleBuyCallback(
          token,
          chatId,
          callbackQuery.id,
          from,
          contentId,
          botId,
          botUserId
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Telegram Webhook] Error:", error);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ success: true });
  }
}
