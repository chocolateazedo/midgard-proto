"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotById } from "@/server/queries/bots";
import {
  createIvsChannelForBot,
  getDecryptedStreamKey,
} from "@/lib/ivs";
import { liveStreamSchema } from "@/lib/validations";
import type { LiveStreamInput } from "@/lib/validations";
import type { ActionResponse, LiveStream } from "@/types";

/**
 * Server actions para configuração de live por bot.
 *
 * Diferenças para o fluxo antigo (MediaMTX):
 * - Um canal IVS é criado por bot no primeiro upsert, reusado entre lives.
 * - `isLive` NÃO é mais alterado manualmente — é atualizado pelo webhook IVS
 *   quando o criador inicia/encerra a transmissão via OBS.
 * - `toggleLive` virou um no-op que retorna erro explicativo (UI deve migrar).
 * - Nova action `getCreatorStreamCredentials` devolve ingestEndpoint + streamKey
 *   decriptada pro criador colar no OBS.
 */

async function assertBotAccess(botId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Não autenticado" };
  }

  const bot = await getBotById(botId);
  if (!bot) {
    return { ok: false as const, error: "Bot não encontrado" };
  }

  const isOwnerRole =
    session.user.role === "owner" || session.user.role === "admin";
  if (bot.userId !== session.user.id && !isOwnerRole) {
    return { ok: false as const, error: "Sem permissão" };
  }

  return { ok: true as const, bot, session };
}

export async function getLiveStream(
  botId: string
): Promise<ActionResponse<LiveStream | null>> {
  try {
    const access = await assertBotAccess(botId);
    if (!access.ok) return { success: false, error: access.error };

    const liveStream = await db.liveStream.findUnique({
      where: { botId },
    });

    return { success: true, data: liveStream };
  } catch (error) {
    console.error("[getLiveStream]", error);
    return { success: false, error: "Erro ao buscar configuração de live" };
  }
}

export async function upsertLiveStream(
  botId: string,
  input: LiveStreamInput
): Promise<ActionResponse<LiveStream>> {
  try {
    const access = await assertBotAccess(botId);
    if (!access.ok) return { success: false, error: access.error };

    const parsed = liveStreamSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    if (parsed.data.price > 0) {
      const { assertMinTransactionPrice } = await import("@/lib/payment-limits");
      const minCheck = await assertMinTransactionPrice(parsed.data.price);
      if (!minCheck.ok) {
        return { success: false, error: minCheck.message };
      }
    }

    // Se ainda não existe canal IVS pra este bot, cria agora.
    // Operação idempotente: se já existe, só atualiza metadados.
    const existing = await db.liveStream.findUnique({ where: { botId } });

    let ivsFields: {
      ivsChannelArn: string;
      ivsChannelName: string;
      ivsIngestEndpoint: string;
      ivsPlaybackUrl: string;
      ivsStreamKeyArn: string;
      ivsStreamKeyEncrypted: string;
    } | null = null;

    if (!existing?.ivsChannelArn) {
      try {
        const channel = await createIvsChannelForBot(botId);
        ivsFields = {
          ivsChannelArn: channel.channelArn,
          ivsChannelName: channel.channelName,
          ivsIngestEndpoint: channel.ingestEndpoint,
          ivsPlaybackUrl: channel.playbackUrl,
          ivsStreamKeyArn: channel.streamKeyArn,
          ivsStreamKeyEncrypted: channel.streamKeyEncrypted,
        };
      } catch (e) {
        console.error("[upsertLiveStream] Erro criando canal IVS:", e);
        return {
          success: false,
          error:
            "Falha ao provisionar canal de transmissão. Tente novamente em alguns segundos.",
        };
      }
    }

    // Gerar streamLink automático para a página /watch
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const autoStreamLink = `${baseUrl}/watch/${botId}`;

    const common = {
      title: parsed.data.title ?? null,
      description: parsed.data.description ?? null,
      price: (parsed.data.price ?? 0).toFixed(2),
      streamLink: autoStreamLink,
      notifySubscribers: parsed.data.notifySubscribers ?? false,
    };

    const liveStream = await db.liveStream.upsert({
      where: { botId },
      create: {
        botId,
        isLive: false,
        ...common,
        ...(ivsFields ?? {}),
      },
      update: {
        ...common,
        ...(ivsFields ?? {}),
      },
    });

    revalidatePath(`/dashboard/bots/${botId}/settings`);

    return { success: true, data: liveStream };
  } catch (error) {
    console.error("[upsertLiveStream]", error);
    return { success: false, error: "Erro ao salvar configuração de live" };
  }
}

/**
 * DEPRECATED: o estado "ao vivo" agora é determinado pela conexão real do OBS
 * ao IVS. Esta action foi mantida apenas pra não quebrar callers existentes do
 * dashboard, mas retorna um erro explicativo.
 *
 * TODO: substituir a UI que chama toggleLive por uma que apenas mostra o
 * status (derivado de liveStream.isLive) e instruções de como iniciar a
 * transmissão via OBS.
 */
export async function toggleLive(
  _botId: string
): Promise<ActionResponse<{ isLive: boolean }>> {
  return {
    success: false,
    error:
      "O status ao vivo agora é controlado automaticamente pela transmissão. Inicie a live no OBS apontando pro endpoint configurado.",
  };
}

/**
 * Retorna as credenciais de ingest pro criador configurar no OBS.
 * A stream key é decriptada só neste momento e retornada uma única vez.
 * NÃO deve ser logada nem persistida em cache.
 */
export async function getCreatorStreamCredentials(
  botId: string
): Promise<
  ActionResponse<{
    ingestEndpoint: string;
    streamKey: string;
    playbackUrl: string;
  }>
> {
  try {
    const access = await assertBotAccess(botId);
    if (!access.ok) return { success: false, error: access.error };

    const liveStream = await db.liveStream.findUnique({ where: { botId } });
    if (!liveStream?.ivsChannelArn || !liveStream.ivsStreamKeyEncrypted) {
      return {
        success: false,
        error:
          "Canal de transmissão não provisionado. Salve a configuração de live primeiro.",
      };
    }

    const streamKey = await getDecryptedStreamKey(
      liveStream.ivsStreamKeyEncrypted
    );

    return {
      success: true,
      data: {
        ingestEndpoint: liveStream.ivsIngestEndpoint ?? "",
        streamKey,
        playbackUrl: liveStream.ivsPlaybackUrl ?? "",
      },
    };
  } catch (error) {
    console.error("[getCreatorStreamCredentials]", error);
    return { success: false, error: "Erro ao buscar credenciais de ingest" };
  }
}
