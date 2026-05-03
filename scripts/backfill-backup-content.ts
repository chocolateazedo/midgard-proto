// Backfill: cria Content (deliveryMode=catalog, availability=available)
// pra todo ChannelBackupItem que ainda não tem contentId.
//
// Idempotente: pula items com contentId já preenchido.
// publishedAt + sentToChannelAt = messageAt pra não disparar re-broadcast.

import { PrismaClient } from "@prisma/client";

function mediaTypeToContentType(
  mediaType: string,
): "image" | "video" | "file" | "bundle" {
  switch (mediaType) {
    case "photo":
      return "image";
    case "video":
    case "animation":
      return "video";
    default:
      return "file";
  }
}

function deriveTitleDescription(
  caption: string | null,
  messageId: number,
  messageAt: Date,
): { title: string; description: string | null } {
  if (caption && caption.trim()) {
    const lines = caption.split("\n").map((l) => l.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const title = first.slice(0, 200);
    const rest = lines.slice(1).join("\n").trim();
    return {
      title,
      description: rest.length > 0 ? rest : caption.length > 200 ? caption : null,
    };
  }
  const dateLabel = messageAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    title: `Post #${messageId} — ${dateLabel}`,
    description: null,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL é obrigatória");
    process.exit(1);
  }

  const db = new PrismaClient();
  console.log("🔧 Backfill: ChannelBackupItem → Content (catalog/assinante)");

  // Carrega bots de uma vez pra mapear botId → userId.
  const bots = await db.bot.findMany({ select: { id: true, userId: true } });
  const ownerByBot = new Map(bots.map((b) => [b.id, b.userId]));

  const PAGE = 200;
  let cursor: string | undefined = undefined;
  let processed = 0;
  let created = 0;
  let skippedNoOwner = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const items = await db.channelBackupItem.findMany({
      where: { contentId: null },
      take: PAGE,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (items.length === 0) break;
    cursor = items[items.length - 1]!.id;

    for (const item of items) {
      processed += 1;
      const ownerUserId = ownerByBot.get(item.botId);
      if (!ownerUserId) {
        skippedNoOwner += 1;
        continue;
      }
      const { title, description } = deriveTitleDescription(
        item.caption,
        item.telegramMessageId,
        item.messageAt,
      );
      try {
        await db.$transaction(async (tx) => {
          const content = await tx.content.create({
            data: {
              botId: item.botId,
              userId: ownerUserId,
              title,
              description,
              type: mediaTypeToContentType(item.mediaType),
              price: "0",
              originalKey: item.storageKey,
              deliveryMode: "catalog",
              availability: "available",
              publishedAt: item.messageAt,
              sentToChannelAt: item.messageAt,
            },
            select: { id: true },
          });
          await tx.channelBackupItem.update({
            where: { id: item.id },
            data: { contentId: content.id },
          });
        });
        created += 1;
      } catch (err) {
        console.error(`  ✗ item ${item.id} falhou:`, err);
      }
    }

    if (processed % 1000 === 0) {
      console.log(`  …${processed} processados, ${created} Content criados`);
    }
  }

  console.log(
    `✅ Backfill concluído: ${processed} items processados, ${created} Content criados, ${skippedNoOwner} pulados (sem owner)`,
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error("❌ Backfill falhou:", err);
  process.exit(1);
});
