import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export type SerializedContentItem = {
  id: string;
  botId: string;
  userId: string;
  title: string;
  description: string | null;
  type: "image" | "video" | "file" | "bundle";
  price: number;
  originalKey: string;
  previewKey: string | null;
  originalUrl: string | null;
  previewUrl: string | null;
  availability: "available" | "inactive";
  deliveryMode: "ondemand" | "catalog";
  scheduledAt: Date | null;
  publishedAt: Date | null;
  sentToChannelAt: Date | null;
  purchaseCount: number;
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
  bot: { id: string; name: string; username: string | null };
};

export type SerializedContentDetail = Omit<SerializedContentItem, "bot"> & {
  bot: {
    id: string;
    name: string;
    username: string | null;
    isActive: boolean;
    userId: string;
    user?: { managedByUserId: string | null };
  };
};

export async function getContentByBotId(botId: string): Promise<SerializedContentItem[]> {
  const items = await db.content.findMany({
    where: { botId },
    include: {
      bot: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((c) => ({
    ...c,
    price: c.price.toNumber(),
    totalRevenue: c.totalRevenue.toNumber(),
  }));
}

export async function getContentById(contentId: string): Promise<SerializedContentDetail | null> {
  const content = await db.content.findFirst({
    where: { id: contentId },
    include: {
      bot: {
        select: {
          id: true,
          name: true,
          username: true,
          isActive: true,
          userId: true,
          user: { select: { managedByUserId: true } },
        },
      },
    },
  });

  if (!content) return null;

  return {
    ...content,
    price: content.price.toNumber(),
    totalRevenue: content.totalRevenue.toNumber(),
  };
}

export type UpcomingFeedItem =
  | {
      kind: "content";
      id: string;
      title: string;
      scheduledAt: Date;
      deliveryMode: "ondemand" | "catalog";
      price: number;
      type: "image" | "video" | "file" | "bundle";
      hasThumbnail: boolean;
    }
  | {
      kind: "live";
      id: string;
      title: string;
      scheduledAt: Date;
      endAt: Date;
      price: number;
    };

/**
 * Feed "O que vai sair" da home do bot — conteúdos agendados (ainda não
 * publicados) + lives agendadas/ao vivo, tudo ordenado por horário.
 */
export async function getUpcomingFeedByBotId(
  botId: string
): Promise<UpcomingFeedItem[]> {
  const [pendingContent, liveSchedules] = await Promise.all([
    db.content.findMany({
      where: {
        botId,
        scheduledAt: { not: null },
        publishedAt: null,
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        deliveryMode: true,
        price: true,
        type: true,
        previewKey: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),
    db.liveSchedule.findMany({
      where: {
        botId,
        status: { in: ["scheduled", "started"] },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        price: true,
      },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const items: UpcomingFeedItem[] = [
    ...pendingContent.map((c): UpcomingFeedItem => ({
      kind: "content",
      id: c.id,
      title: c.title,
      scheduledAt: c.scheduledAt!,
      deliveryMode: c.deliveryMode,
      price: c.price.toNumber(),
      type: c.type,
      hasThumbnail: !!c.previewKey,
    })),
    ...liveSchedules.map((l): UpcomingFeedItem => ({
      kind: "live",
      id: l.id,
      title: l.title,
      scheduledAt: l.startAt,
      endAt: l.endAt,
      price: l.price.toNumber(),
    })),
  ];

  items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  return items;
}

/**
 * Soma o creatorNet de compras pagas na janela atual da semana (segunda 00:00
 * até domingo 23:59:59), para um bot específico.
 */
export async function getWeeklyEarningsByBotId(
  botId: string
): Promise<number> {
  const now = new Date();
  const day = now.getDay(); // 0=domingo
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const [p, s] = await Promise.all([
    db.purchase.aggregate({
      where: {
        botId,
        status: "paid",
        amount: { gt: 0 },
        paidAt: { gte: weekStart },
      },
      _sum: { creatorNet: true },
    }),
    db.subscription.aggregate({
      where: { botId, paidAt: { gte: weekStart } },
      _sum: { creatorNet: true },
    }),
  ]);

  return (
    (p._sum.creatorNet?.toNumber() ?? 0) +
    (s._sum.creatorNet?.toNumber() ?? 0)
  );
}

export async function getPublishedContentByBotId(botId: string): Promise<SerializedContentItem[]> {
  const items = await db.content.findMany({
    where: {
      botId,
      availability: "available",
      publishedAt: { not: null },
    },
    include: {
      bot: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((c) => ({
    ...c,
    price: c.price.toNumber(),
    totalRevenue: c.totalRevenue.toNumber(),
  }));
}

/**
 * Filtros do novo modelo de Content management.
 * - tab=subscribers → conteúdo pra assinantes (deliveryMode=catalog)
 * - tab=individual → conteúdo unitário pago (deliveryMode=ondemand)
 * - tab=scheduled → futuros (scheduledAt > now AND publishedAt IS NULL)
 *   sem filtro de deliveryMode
 *
 * Paginação 20/página por padrão.
 */
export async function listContentByBotIdPaginated(
  botId: string,
  opts: {
    tab: "subscribers" | "individual" | "scheduled";
    page?: number;
    pageSize?: number;
  }
): Promise<{ items: SerializedContentItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ContentWhereInput = (() => {
    if (opts.tab === "scheduled") {
      return {
        botId,
        scheduledAt: { gt: new Date() },
        publishedAt: null,
      };
    }
    if (opts.tab === "subscribers") {
      return { botId, deliveryMode: "catalog" };
    }
    return { botId, deliveryMode: "ondemand" };
  })();

  const [rows, total] = await Promise.all([
    db.content.findMany({
      where,
      include: {
        bot: { select: { id: true, name: true, username: true } },
      },
      orderBy:
        opts.tab === "scheduled"
          ? { scheduledAt: "asc" }
          : { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.content.count({ where }),
  ]);

  return {
    items: rows.map((c) => ({
      ...c,
      price: c.price.toNumber(),
      totalRevenue: c.totalRevenue.toNumber(),
    })),
    total,
    page,
    pageSize,
  };
}
