import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSignedPlaybackUrl } from "@/lib/ivs";

/**
 * GET /api/live/access?botId=<id>&token=<botUserId>
 *
 * Emite uma playback URL IVS assinada (JWT ES384, validade 1h) se o viewer
 * tiver direito de assistir. Chamado pela página /watch/[botId] antes de
 * inicializar o player.
 *
 * Regra de acesso (preservada do endpoint antigo /api/live/auth):
 * - Live deve estar ativa (liveStream.isLive == true)
 * - Se price == 0: acesso liberado
 * - Se price > 0: precisa de Purchase paga (contentId null) do botUser,
 *   com paidAt dentro das últimas 24h
 *
 * Resposta:
 *   200 { playbackUrl, expiresAt } — URL pronta pro IVS Player consumir
 *   401 { error } — token/bot inválido
 *   403 { error } — live inativa ou sem acesso
 *   500 { error } — erro interno
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sp = request.nextUrl.searchParams;
    const botId = sp.get("botId");
    const token = sp.get("token");

    if (!botId || !token) {
      return NextResponse.json(
        { error: "botId e token são obrigatórios" },
        { status: 401 }
      );
    }

    const liveStream = await db.liveStream.findUnique({ where: { botId } });
    if (!liveStream) {
      return NextResponse.json(
        { error: "Configuração de live não encontrada" },
        { status: 401 }
      );
    }

    if (!liveStream.isLive) {
      return NextResponse.json(
        { error: "Transmissão não está ativa" },
        { status: 403 }
      );
    }

    if (!liveStream.ivsChannelArn || !liveStream.ivsPlaybackUrl) {
      return NextResponse.json(
        { error: "Canal de transmissão não provisionado" },
        { status: 500 }
      );
    }

    // Verificação de paywall
    const price = parseFloat(liveStream.price.toString());
    if (price > 0) {
      const botUser = await db.botUser.findFirst({ where: { id: token } });
      if (!botUser) {
        return NextResponse.json(
          { error: "Usuário não encontrado" },
          { status: 403 }
        );
      }

      const purchase = await db.purchase.findFirst({
        where: {
          botId,
          botUserId: botUser.id,
          contentId: null,
          status: "paid",
        },
        orderBy: { paidAt: "desc" },
      });

      if (!purchase?.paidAt) {
        return NextResponse.json(
          { error: "Sem compra válida pra esta live" },
          { status: 403 }
        );
      }

      const hoursSincePurchase =
        (Date.now() - purchase.paidAt.getTime()) / (1000 * 60 * 60);
      if (hoursSincePurchase > 24) {
        return NextResponse.json(
          { error: "Compra expirada (acesso por 24h)" },
          { status: 403 }
        );
      }
    }

    // Gera JWT signed (validade 1h, controlada em src/lib/ivs.ts)
    const { url: playbackUrl, expiresAt } = buildSignedPlaybackUrl(
      liveStream.ivsPlaybackUrl,
      liveStream.ivsChannelArn
    );

    return NextResponse.json(
      {
        playbackUrl,
        expiresAt: expiresAt.toISOString(),
        title: liveStream.title ?? "Ao Vivo",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/live/access] erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
