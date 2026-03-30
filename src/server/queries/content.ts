import { db } from "@/lib/db";
import { content, bots } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function getContentByBotId(botId: string) {
  return db.query.content.findMany({
    where: eq(content.botId, botId),
    with: {
      bot: {
        columns: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: [desc(content.createdAt)],
  });
}

export async function getContentById(contentId: string) {
  return db.query.content.findFirst({
    where: eq(content.id, contentId),
    with: {
      bot: {
        columns: {
          id: true,
          name: true,
          username: true,
          isActive: true,
          userId: true,
        },
      },
    },
  });
}

export async function getPublishedContentByBotId(botId: string) {
  return db.query.content.findMany({
    where: and(eq(content.botId, botId), eq(content.isPublished, true)),
    with: {
      bot: {
        columns: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: [desc(content.createdAt)],
  });
}
