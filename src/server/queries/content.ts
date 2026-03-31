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
  isPublished: boolean;
  purchaseCount: number;
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
  bot: { id: string; name: string; username: string | null };
};

export type SerializedContentDetail = Omit<SerializedContentItem, "bot"> & {
  bot: { id: string; name: string; username: string | null; isActive: boolean; userId: string };
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

export async function getPublishedContentByBotId(botId: string): Promise<SerializedContentItem[]> {
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
