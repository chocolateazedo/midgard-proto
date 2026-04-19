import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIvsCostFinalizeQueue } from "@/lib/queue";
import { decrypt } from "@/lib/crypto";
import { scheduleLiveBroadcast } from "@/lib/inline-jobs";

/**
 * POST /api/webhooks/ivs
 *
 * Recebe eventos do Amazon IVS via EventBridge API Destination.
 * Formato do payload é o envelope padrão do EventBridge:
 *
 * {
 *   "version": "0",
 *   "detail-type": "IVS Stream State Change",
 *   "source": "aws.ivs",
 *   "account": "241459378940",
 *   "time": "2026-04-12T10:00:00Z",
 *   "region": "us-east-1",
 *   "resources": ["arn:aws:ivs:us-east-1:241459378940:channel/abc123"],
 *   "detail": {
 *     "channel_name": "botfans-<botId>",
 *     "stream_id": "st-xxxxxx",
 *     "event_name": "Stream Start" | "Stream End" | "Session Created" | ...,
 *     "ingest_configuration": { ... }
 *   }
 * }
 *
 * Auth: header Authorization: Bearer <IVS_WEBHOOK_SECRET>
 * (o EventBridge API Destination injeta header configurável via Connection).
 *
 * Eventos tratados:
 * - "Stream Start": marca LiveStream.isLive=true, cria LiveStreamSession,
 *   dispara notificação de broadcast se configurado
 * - "Stream End":   marca LiveStream.isLive=false, finaliza LiveStreamSession
 *   (endedAt + durationSeconds), enfileira job delayed de cálculo de custo
 * - demais: ignorados (registrados em debug)
 */

interface IvsEventBridgePayload {
  "detail-type"?: string;
  source?: string;
  resources?: string[];
  time?: string;
  detail?: {
    channel_name?: string;
    stream_id?: string;
    event_name?: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth por shared secret
  const expectedSecret = process.env.IVS_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error(
      "[webhook/ivs] IVS_WEBHOOK_SECRET não configurado — recusando"
    );
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: IvsEventBridgePayload;
  try {
    payload = (await request.json()) as IvsEventBridgePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.source !== "aws.ivs") {
    return NextResponse.json(
      { error: "Source não é aws.ivs" },
      { status: 400 }
    );
  }

  const eventName = payload.detail?.event_name;
  const channelName = payload.detail?.channel_name;
  const streamId = payload.detail?.stream_id;
  const channelArn = payload.resources?.[0];
  const eventTime = payload.time ? new Date(payload.time) : new Date();

  if (!channelName || !channelArn) {
    return NextResponse.json(
      { error: "Payload sem channel_name/arn" },
      { status: 400 }
    );
  }

  // Resolve o LiveStream pelo channelArn (mais confiável que o nome)
  const liveStream = await db.liveStream.findFirst({
    where: { ivsChannelArn: channelArn },
  });

  if (!liveStream) {
    console.warn(
      `[webhook/ivs] Evento pra canal ${channelArn} sem LiveStream correspondente`
    );
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  try {
    switch (eventName) {
      case "Stream Start": {
        if (!streamId) {
          console.warn("[webhook/ivs] Stream Start sem stream_id");
          break;
        }

        await db.$transaction([
          db.liveStream.update({
            where: { id: liveStream.id },
            data: { isLive: true },
          }),
          db.liveStreamSession.upsert({
            where: { ivsStreamId: streamId },
            create: {
              liveStreamId: liveStream.id,
              botId: liveStream.botId,
              ivsChannelArn: channelArn,
              ivsStreamId: streamId,
              startedAt: eventTime,
              qualityTier: liveStream.ivsQualityTier,
              status: "live",
            },
            update: {
              // Re-open em caso de webhook duplicado
              status: "live",
              endedAt: null,
            },
          }),
        ]);

        // Notifica assinantes se habilitado (disparo fire-and-forget)
        if (liveStream.notifySubscribers) {
          try {
            const bot = await db.bot.findUnique({
              where: { id: liveStream.botId },
            });
            if (bot) {
              const token = decrypt(bot.telegramToken);
              scheduleLiveBroadcast({
                botId: liveStream.botId,
                token,
                title: liveStream.title ?? "Transmissão ao vivo",
              });
            }
          } catch (e) {
            console.error(
              "[webhook/ivs] Erro ao disparar notificação de live:",
              e
            );
          }
        }

        console.log(
          `[webhook/ivs] Stream Start: bot=${liveStream.botId} sessão=${streamId}`
        );
        break;
      }

      case "Stream End": {
        if (!streamId) {
          console.warn("[webhook/ivs] Stream End sem stream_id");
          break;
        }

        const session = await db.liveStreamSession.findUnique({
          where: { ivsStreamId: streamId },
        });

        if (!session) {
          console.warn(
            `[webhook/ivs] Stream End pra sessão desconhecida ${streamId}`
          );
          // Mesmo assim, força LiveStream pra offline
          await db.liveStream.update({
            where: { id: liveStream.id },
            data: { isLive: false },
          });
          break;
        }

        const durationSeconds = Math.max(
          0,
          Math.floor(
            (eventTime.getTime() - session.startedAt.getTime()) / 1000
          )
        );

        await db.$transaction([
          db.liveStream.update({
            where: { id: liveStream.id },
            data: { isLive: false },
          }),
          db.liveStreamSession.update({
            where: { id: session.id },
            data: {
              endedAt: eventTime,
              durationSeconds,
              // status fica "live" até o worker de custo finalizar
            },
          }),
        ]);

        // Enfileira job de finalização com delay de 5 min
        // (tempo pra CloudWatch consolidar métricas do IVS)
        await getIvsCostFinalizeQueue().add(
          "ivs-cost-finalize",
          { sessionId: session.id },
          { delay: 5 * 60 * 1000 }
        );

        console.log(
          `[webhook/ivs] Stream End: bot=${liveStream.botId} sessão=${streamId} dur=${durationSeconds}s`
        );
        break;
      }

      default:
        console.log(
          `[webhook/ivs] Evento ignorado: ${eventName} canal=${channelArn}`
        );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[webhook/ivs] erro processando evento:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
