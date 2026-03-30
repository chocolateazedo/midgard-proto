import { db } from "@/lib/db";

export async function getContentByBotId(botId: string) {
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

export async function getContentById(contentId: string) {
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

export async function getPublishedContentByBotId(botId: string) {
  const items = await db.content.findMany({
    where: {
      botId,
      isPublished: true,
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
