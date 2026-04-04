import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/live/auth
 * Chamado pelo MediaMTX para validar publish (creator) e read (viewer).
 *
 * Body do MediaMTX:
 * { user, password, ip, action, path, protocol, query }
 *
 * action = "publish" → creator iniciando transmissão
 * action = "read"    → viewer assistindo via HLS
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, path: streamPath, query } = body as {
      action: string;
      path: string;
      protocol: string;
      query: string;
      user: string;
      password: string;
      ip: string;
    };

    // Extrair botId do path (formato: "live/BOT_ID")
    const botId = streamPath?.replace("live/", "");
    if (!botId) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const bot = await db.bot.findFirst({ where: { id: botId } });
    if (!bot) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // --- PUBLISH: creator iniciando transmissão ---
    if (action === "publish") {
      // Validar via streamKey na query string (?key=...)
      const params = new URLSearchParams(query);
      const streamKey = params.get("key");

      if (!streamKey) {
        return NextResponse.json({ ok: false }, { status: 401 });
      }

      // A streamKey é o token do bot encriptado — validar comparando
      const liveStream = await db.liveStream.findUnique({ where: { botId } });
      if (!liveStream) {
        return NextResponse.json({ ok: false }, { status: 401 });
      }

      // Usar o id do liveStream como streamKey simples
      if (streamKey !== liveStream.id) {
        return NextResponse.json({ ok: false }, { status: 401 });
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // --- READ: viewer assistindo ---
    if (action === "read") {
      const params = new URLSearchParams(query);
      const token = params.get("token");

      if (!token) {
        return NextResponse.json({ ok: false }, { status: 401 });
      }

      // Token é o purchaseId ou botUserId — validar acesso pago
      const liveStream = await db.liveStream.findUnique({ where: { botId } });
      if (!liveStream || !liveStream.isLive) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }

      // Acesso gratuito
      const price = parseFloat(liveStream.price.toString());
      if (price === 0) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      // Validar que o botUser tem compra paga para esta live
      const botUser = await db.botUser.findFirst({
        where: { id: token },
      });

      if (!botUser) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }

      // Verificar purchase paga de live (contentId placeholder)
      const purchase = await db.purchase.findFirst({
        where: {
          botId,
          botUserId: botUser.id,
          contentId: "00000000-0000-0000-0000-000000000000",
          status: "paid",
        },
        orderBy: { paidAt: "desc" },
      });

      if (!purchase) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }

      // Verificar se a compra não é muito antiga (acesso por 24h)
      if (purchase.paidAt) {
        const hoursSincePurchase =
          (Date.now() - purchase.paidAt.getTime()) / (1000 * 60 * 60);
        if (hoursSincePurchase > 24) {
          return NextResponse.json({ ok: false }, { status: 403 });
        }
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Qualquer outra action — negar
    return NextResponse.json({ ok: false }, { status: 401 });
  } catch (error) {
    console.error("[Live Auth] Erro:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
