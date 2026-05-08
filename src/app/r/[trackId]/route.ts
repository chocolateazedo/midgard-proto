// Link tracker pra cliques de botões em broadcast.
// trackId = `<recipientId>-<buttonIndex>`. Lookup recipient + button URL,
// insere BroadcastClick e redireciona 302 pra URL real.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface BroadcastButton {
  text: string;
  action: { type: "link" | "channel"; url: string };
}
interface BroadcastContent {
  text: string;
  buttons?: BroadcastButton[];
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ trackId: string }> },
): Promise<Response> {
  const { trackId } = await ctx.params;

  // Formato: <uuid>-<index>. Index é último segmento numérico.
  const lastDash = trackId.lastIndexOf("-");
  if (lastDash <= 0) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const recipientId = trackId.slice(0, lastDash);
  const buttonIndex = parseInt(trackId.slice(lastDash + 1), 10);
  if (!Number.isFinite(buttonIndex) || buttonIndex < 0) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // UUID v4 — valida grosseiramente pra evitar query inválida.
  if (!/^[0-9a-f-]{36}$/i.test(recipientId)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const recipient = await db.broadcastRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      campaign: { select: { content: true, status: true } },
    },
  });
  if (!recipient) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const content = recipient.campaign.content as unknown as BroadcastContent;
  const button = content.buttons?.[buttonIndex];
  if (!button) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const targetUrl = button.action.url;

  // Auditoria do clique. Falha aqui não derruba o redirect.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  db.broadcastClick
    .create({
      data: {
        recipientId,
        buttonIndex,
        url: targetUrl.slice(0, 2000),
        ip,
        userAgent: ua,
      },
    })
    .catch((err) => {
      console.error("[link-tracker] click insert falhou:", err);
    });

  return NextResponse.redirect(targetUrl, 302);
}
