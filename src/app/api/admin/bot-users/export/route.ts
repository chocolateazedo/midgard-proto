// CSV export de todos BotUsers da plataforma. Admin-only. Stream pra
// não estourar memória em base grande.

import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 500;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Não autenticado" },
      { status: 401 },
    );
  }
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Apenas owner/admin" },
      { status: 403 },
    );
  }

  const headers = [
    "id",
    "botId",
    "botName",
    "telegramUserId",
    "telegramUsername",
    "telegramFirstName",
    "firstSeenAt",
    "lastSeenAt",
    "optedOutAt",
    "optedOutSource",
    "blockedBotAt",
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(headers.join(",") + "\n"));

      let cursor: string | undefined;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await db.botUser.findMany({
          take: PAGE_SIZE,
          orderBy: { id: "asc" },
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          select: {
            id: true,
            botId: true,
            telegramUserId: true,
            telegramUsername: true,
            telegramFirstName: true,
            firstSeenAt: true,
            lastSeenAt: true,
            optedOutAt: true,
            optedOutSource: true,
            blockedBotAt: true,
            bot: { select: { name: true } },
          },
        });
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1]!.id;

        const chunk = rows
          .map((r) =>
            [
              csvEscape(r.id),
              csvEscape(r.botId),
              csvEscape(r.bot.name),
              csvEscape(r.telegramUserId.toString()),
              csvEscape(r.telegramUsername),
              csvEscape(r.telegramFirstName),
              csvEscape(r.firstSeenAt.toISOString()),
              csvEscape(r.lastSeenAt.toISOString()),
              csvEscape(r.optedOutAt ? r.optedOutAt.toISOString() : ""),
              csvEscape(r.optedOutSource),
              csvEscape(r.blockedBotAt ? r.blockedBotAt.toISOString() : ""),
            ].join(","),
          )
          .join("\n");
        controller.enqueue(enc.encode(chunk + "\n"));
      }
      controller.close();
    },
  });

  const ts = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="botfans-bot-users-${ts}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
