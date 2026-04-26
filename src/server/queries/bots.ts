import { db } from "@/lib/db";
import type { PurchaseStatus, SubscriptionStatus, ContentType, Prisma } from "@prisma/client";

export type SerializedBot = {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  telegramToken: string;
  description: string | null;
  isActive: boolean;
  webhookUrl: string | null;
  // ATENÇÃO: nome legado. Conta TODOS os BotUsers do bot (seguidores
  // = quem interagiu), não assinantes. Mantido pra retrocompat. Quem
  // precisa de assinantes reais (Subscription ativa) usa
  // activeSubscriberCount.
  totalSubscribers: number;
  // Quantidade de Subscription com status=active e endDate no futuro
  // pra esse bot. Esse é o "assinantes" no sentido de plano pago
  // ativo. Default 0 quando query não preenche (callers que serializam
  // diretamente sem contagem).
  activeSubscriberCount: number;
  totalRevenue: number;
  // channelId é BigInt no Prisma; serializamos como string pra cruzar
  // a fronteira da API (JSON.stringify quebra com BigInt nativo).
  channelId: string | null;
  channelUsername: string | null;
  channelTitle: string | null;
  channelLinkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Converte os campos não-JSON-safe de um Bot do Prisma pra primitivos
 * e injeta `activeSubscriberCount` (default 0). Aplicado em todas as
 * queries que retornam Bot pro front.
 */
function serializeBot<T extends {
  totalRevenue: { toNumber: () => number };
  channelId: bigint | null;
}>(
  bot: T,
  activeSubscriberCount = 0,
): Omit<T, "totalRevenue" | "channelId"> & {
  totalRevenue: number;
  channelId: string | null;
  activeSubscriberCount: number;
} {
  return {
    ...bot,
    totalRevenue: bot.totalRevenue.toNumber(),
    channelId: bot.channelId !== null ? bot.channelId.toString() : null,
    activeSubscriberCount,
  };
}

/**
 * Conta Subscriptions ativas (plano pago no ar) por bot, em batch.
 * Retorna Map<botId, count>. Quando lista é vazia retorna Map vazio.
 */
async function countActiveSubscribersByBot(
  botIds: string[],
): Promise<Map<string, number>> {
  if (botIds.length === 0) return new Map();
  const rows = await db.subscription.groupBy({
    by: ["botId"],
    where: {
      botId: { in: botIds },
      status: "active",
      endDate: { gt: new Date() },
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.botId, r._count._all);
  return map;
}

export type SerializedBotWithUser = SerializedBot & {
  user: { id: string; name: string; email: string };
};

export type SerializedBotWithUserRole = SerializedBot & {
  user: { id: string; name: string; email: string; role: "owner" | "admin" | "manager" | "creator" };
};

export type SerializedBotWithUserFull = SerializedBot & {
  user: {
    id: string;
    name: string;
    email: string;
    role: "owner" | "admin" | "manager" | "creator";
    platformFeePercent: number;
    managedByUserId: string | null;
  };
};

export type SerializedContent = {
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
};

export type SerializedBotWithContent = SerializedBotWithUser & {
  content: SerializedContent[];
};

export type SerializedSubscriber = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  totalSpent: string;
  activePlanName: string | null;
};

/**
 * Conta quantos BotUsers distintos têm ao menos uma assinatura ativa agora
 * (status active + endDate no futuro). Usado em dashboards/admin.
 */
export async function getActiveSubscribersCount(): Promise<number> {
  const rows = await db.subscription.findMany({
    where: { status: "active", endDate: { gt: new Date() } },
    select: { botUserId: true },
    distinct: ["botUserId"],
  });
  return rows.length;
}

export async function getBotsByUserId(userId: string): Promise<SerializedBotWithUser[]> {
  const bots = await db.bot.findMany({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const counts = await countActiveSubscribersByBot(bots.map((b) => b.id));
  return bots.map((b) => serializeBot(b, counts.get(b.id) ?? 0));
}

export async function getBotById(botId: string): Promise<SerializedBotWithUserFull | null> {
  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          platformFeePercent: true,
          managedByUserId: true,
        },
      },
    },
  });

  if (!bot) return null;

  const counts = await countActiveSubscribersByBot([bot.id]);
  return {
    ...serializeBot(bot, counts.get(bot.id) ?? 0),
    user: {
      ...bot.user,
      platformFeePercent: bot.user.platformFeePercent.toNumber(),
    },
  };
}

export async function getAllBots(): Promise<SerializedBotWithUserRole[]> {
  const bots = await db.bot.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const counts = await countActiveSubscribersByBot(bots.map((b) => b.id));
  return bots.map((b) => serializeBot(b, counts.get(b.id) ?? 0));
}

export async function getBotWithContent(botId: string): Promise<SerializedBotWithContent | null> {
  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      content: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!bot) return null;

  const counts = await countActiveSubscribersByBot([bot.id]);
  return {
    ...serializeBot(bot, counts.get(bot.id) ?? 0),
    content: bot.content.map((c) => ({
      ...c,
      price: c.price.toNumber(),
      totalRevenue: c.totalRevenue.toNumber(),
    })),
  };
}

export async function getBotSubscribers(
  botId: string,
  page: number,
  pageSize: number,
  opts?: { withActiveSubscription?: boolean }
): Promise<{
  subscribers: SerializedSubscriber[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const skip = (page - 1) * pageSize;

  const where: Prisma.BotUserWhereInput = { botId };
  if (opts?.withActiveSubscription) {
    where.subscriptions = {
      some: {
        status: "active",
        endDate: { gt: new Date() },
      },
    };
  }

  const subscribers = await db.botUser.findMany({
    where,
    include: {
      purchases: {
        where: { status: "paid", amount: { gt: 0 } },
        select: { amount: true },
      },
      subscriptions: {
        where: { paidAt: { not: null } },
        select: {
          amount: true,
          status: true,
          endDate: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    skip,
    take: pageSize,
  });

  const total = await db.botUser.count({ where });
  const now = new Date();

  const subscribersWithTotals: SerializedSubscriber[] = subscribers.map((subscriber) => {
    const purchasesSpent = subscriber.purchases.reduce(
      (acc, p) => acc + p.amount.toNumber(),
      0
    );
    const subsSpent = subscriber.subscriptions.reduce(
      (acc, s) => acc + s.amount.toNumber(),
      0
    );
    const totalSpent = (purchasesSpent + subsSpent).toFixed(2);

    const activeSub = subscriber.subscriptions.find(
      (s) => s.status === "active" && s.endDate && s.endDate > now
    );

    const { purchases: _p, subscriptions: _s, ...rest } = subscriber;
    return {
      ...rest,
      telegramUserId: Number(rest.telegramUserId),
      totalSpent,
      activePlanName: activeSub?.plan.name ?? null,
    };
  });

  return {
    subscribers: subscribersWithTotals,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export type SerializedPurchaseDetail = {
  id: string;
  amount: number;
  platformFee: number;
  creatorNet: number;
  status: PurchaseStatus;
  paidAt: string | null;
  createdAt: string;
  content: {
    id: string;
    title: string;
    type: ContentType;
    price: number;
  } | null;
};

export type SerializedSubscriptionDetail = {
  id: string;
  amount: number;
  platformFee: number;
  creatorNet: number;
  status: SubscriptionStatus;
  startDate: string | null;
  endDate: string | null;
  paidAt: string | null;
  createdAt: string;
  plan: {
    id: string;
    name: string;
    durationDays: number;
    price: number;
    benefits: unknown;
    includesLiveAccess: boolean;
  };
};

export type SerializedSubscriberDetail = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  totalSpent: number;
  purchaseCount: number;
  purchases: SerializedPurchaseDetail[];
  subscriptions: SerializedSubscriptionDetail[];
};

export type PlatformSubscriber = {
  id: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  totalSpent: number;
  bots: { id: string; name: string; username: string | null }[];
};

export async function getAllPlatformSubscribers(
  page: number,
  pageSize: number,
  search?: string,
  opts?: { withActiveSubscription?: boolean }
): Promise<{
  subscribers: PlatformSubscriber[];
  total: number;
  totalPages: number;
}> {
  const where: Prisma.BotUserWhereInput = {};
  if (search) {
    where.OR = [
      { telegramUsername: { contains: search, mode: "insensitive" } },
      { telegramFirstName: { contains: search, mode: "insensitive" } },
    ];
  }
  if (opts?.withActiveSubscription) {
    where.subscriptions = {
      some: {
        status: "active",
        endDate: { gt: new Date() },
      },
    };
  }

  const skip = (page - 1) * pageSize;

  const total = await db.botUser.count({ where });

  const botUsers = await db.botUser.findMany({
    where,
    include: {
      bot: { select: { id: true, name: true, username: true } },
      purchases: {
        where: { status: "paid", amount: { gt: 0 } },
        select: { amount: true },
      },
      subscriptions: {
        where: { paidAt: { not: null } },
        select: { amount: true },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    skip,
    take: pageSize,
  });

  // Agrupar por telegramUserId para unificar o mesmo usuário em múltiplos bots
  const userMap = new Map<string, PlatformSubscriber>();

  for (const bu of botUsers) {
    const tgId = Number(bu.telegramUserId);
    const key = String(tgId);
    const spent =
      bu.purchases.reduce((acc, p) => acc + p.amount.toNumber(), 0) +
      bu.subscriptions.reduce((acc, s) => acc + s.amount.toNumber(), 0);

    const existing = userMap.get(key);
    if (existing) {
      existing.bots.push(bu.bot);
      existing.totalSpent += spent;
      if (new Date(bu.lastSeenAt) > new Date(existing.lastSeenAt)) {
        existing.lastSeenAt = bu.lastSeenAt.toISOString();
      }
    } else {
      userMap.set(key, {
        id: bu.id,
        telegramUserId: tgId,
        telegramUsername: bu.telegramUsername,
        telegramFirstName: bu.telegramFirstName,
        firstSeenAt: bu.firstSeenAt.toISOString(),
        lastSeenAt: bu.lastSeenAt.toISOString(),
        totalSpent: spent,
        bots: [bu.bot],
      });
    }
  }

  return {
    subscribers: Array.from(userMap.values()),
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getBotSubscriberDetail(
  botId: string,
  subscriberId: string
): Promise<SerializedSubscriberDetail | null> {
  const subscriber = await db.botUser.findFirst({
    where: { id: subscriberId, botId },
    include: {
      purchases: {
        include: {
          content: {
            select: { id: true, title: true, type: true, price: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      subscriptions: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              durationDays: true,
              price: true,
              benefits: true,
              includesLiveAccess: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!subscriber) return null;

  const purchasesPaid = subscriber.purchases.filter(
    (p) => p.status === "paid" && p.amount.toNumber() > 0
  );
  const subsPaid = subscriber.subscriptions.filter((s) => !!s.paidAt);
  const totalSpent =
    purchasesPaid.reduce((acc, p) => acc + p.amount.toNumber(), 0) +
    subsPaid.reduce((acc, s) => acc + s.amount.toNumber(), 0);

  return {
    id: subscriber.id,
    botId: subscriber.botId,
    telegramUserId: Number(subscriber.telegramUserId),
    telegramUsername: subscriber.telegramUsername,
    telegramFirstName: subscriber.telegramFirstName,
    firstSeenAt: subscriber.firstSeenAt.toISOString(),
    lastSeenAt: subscriber.lastSeenAt.toISOString(),
    totalSpent,
    purchaseCount: purchasesPaid.length,
    purchases: subscriber.purchases.map((p) => ({
      id: p.id,
      amount: p.amount.toNumber(),
      platformFee: p.platformFee.toNumber(),
      creatorNet: p.creatorNet.toNumber(),
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      content: p.content ? {
        id: p.content.id,
        title: p.content.title,
        type: p.content.type,
        price: p.content.price.toNumber(),
      } : null,
    })),
    subscriptions: subscriber.subscriptions.map((s) => ({
      id: s.id,
      amount: s.amount.toNumber(),
      platformFee: s.platformFee.toNumber(),
      creatorNet: s.creatorNet.toNumber(),
      status: s.status,
      startDate: s.startDate?.toISOString() ?? null,
      endDate: s.endDate?.toISOString() ?? null,
      paidAt: s.paidAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      plan: {
        id: s.plan.id,
        name: s.plan.name,
        durationDays: s.plan.durationDays,
        price: s.plan.price.toNumber(),
        benefits: s.plan.benefits,
        includesLiveAccess: s.plan.includesLiveAccess,
      },
    })),
  };
}
