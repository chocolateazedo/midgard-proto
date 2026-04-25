"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotById } from "@/server/queries/bots";
import {
  createLiveScheduleSchema,
  updateLiveScheduleSchema,
} from "@/lib/validations";
import type {
  CreateLiveScheduleInput,
  UpdateLiveScheduleInput,
} from "@/lib/validations";
import type { ActionResponse } from "@/types";
import { createBroadcastPath, deleteBroadcastPath } from "@/lib/mediamtx";
import {
  createIvsChannelForBot,
  getDecryptedStreamKey,
} from "@/lib/ivs";
import { decrypt } from "@/lib/crypto";
import {
  scheduleLiveBroadcast,
  scheduleLiveCountdownNotifications,
} from "@/lib/inline-jobs";

// "use server" files só podem exportar funções async — constantes locais apenas.
const MAX_CONCURRENT_LIVES = 3;
const MIN_ADVANCE_MINUTES = 10;
const MAX_DURATION_HOURS = 4;

type LiveSchedule = Awaited<ReturnType<typeof db.liveSchedule.findFirst>>;

async function assertBotAccess(botId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Não autenticado" };
  }
  const bot = await getBotById(botId);
  if (!bot) return { ok: false as const, error: "Bot não encontrado" };
  const isAdminRole =
    session.user.role === "owner" || session.user.role === "admin";
  if (bot.userId !== session.user.id && !isAdminRole) {
    return { ok: false as const, error: "Sem permissão" };
  }
  return { ok: true as const, bot, session };
}

/**
 * Conta schedules com janela sobrepondo [startAt, endAt) e status ativo
 * (scheduled ou started). Exclui um schedule específico se informado
 * (usado em update para não contar a si mesmo).
 */
async function countOverlapping(
  startAt: Date,
  endAt: Date,
  excludeId?: string
): Promise<number> {
  return db.liveSchedule.count({
    where: {
      status: { in: ["scheduled", "started"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

export async function createLiveSchedule(
  input: CreateLiveScheduleInput
): Promise<ActionResponse<LiveSchedule>> {
  try {
    const parsed = createLiveScheduleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const access = await assertBotAccess(parsed.data.botId);
    if (!access.ok) return { success: false, error: access.error };

    const { title, description, price, notifySubscribers, startAt, endAt } =
      parsed.data;

    // Mínimo global da plataforma (lives gratuitas com price=0 passam direto).
    if (price > 0) {
      const { assertMinTransactionPrice } = await import("@/lib/payment-limits");
      const minCheck = await assertMinTransactionPrice(price);
      if (!minCheck.ok) {
        return { success: false, error: minCheck.message };
      }
    }

    // Regra: 10 minutos de antecedência entre agora e o início
    const minStart = new Date(Date.now() + MIN_ADVANCE_MINUTES * 60_000);
    if (startAt < minStart) {
      return {
        success: false,
        error: `Agende com pelo menos ${MIN_ADVANCE_MINUTES} minutos de antecedência`,
      };
    }

    // Regra: duração máxima 4 horas
    const maxEnd = new Date(startAt.getTime() + MAX_DURATION_HOURS * 3600_000);
    if (endAt > maxEnd) {
      return {
        success: false,
        error: `Duração máxima permitida é ${MAX_DURATION_HOURS} horas`,
      };
    }

    // Regra: concorrência máxima — count + 1 <= MAX
    const overlapping = await countOverlapping(startAt, endAt);
    if (overlapping >= MAX_CONCURRENT_LIVES) {
      return {
        success: false,
        error: `Horário cheio — já há ${overlapping} live(s) agendada(s) nesse período (máx. ${MAX_CONCURRENT_LIVES})`,
      };
    }

    // Provisiona canal IVS do bot se ainda não existir. Idempotente:
    // a tabela live_streams tem registro por bot, então só cria na 1ª vez.
    const existingLiveStream = await db.liveStream.findUnique({
      where: { botId: parsed.data.botId },
    });
    if (!existingLiveStream?.ivsChannelArn) {
      try {
        const channel = await createIvsChannelForBot(parsed.data.botId);
        await db.liveStream.upsert({
          where: { botId: parsed.data.botId },
          create: {
            botId: parsed.data.botId,
            isLive: false,
            price: (price ?? 0).toFixed(2),
            streamLink: `${process.env.NEXTAUTH_URL ?? "https://botfans.com.br"}/watch/${parsed.data.botId}`,
            ivsChannelArn: channel.channelArn,
            ivsChannelName: channel.channelName,
            ivsIngestEndpoint: channel.ingestEndpoint,
            ivsPlaybackUrl: channel.playbackUrl,
            ivsStreamKeyArn: channel.streamKeyArn,
            ivsStreamKeyEncrypted: channel.streamKeyEncrypted,
          },
          update: {
            ivsChannelArn: channel.channelArn,
            ivsChannelName: channel.channelName,
            ivsIngestEndpoint: channel.ingestEndpoint,
            ivsPlaybackUrl: channel.playbackUrl,
            ivsStreamKeyArn: channel.streamKeyArn,
            ivsStreamKeyEncrypted: channel.streamKeyEncrypted,
          },
        });
      } catch (e) {
        console.error("[createLiveSchedule] falha ao provisionar IVS:", e);
        return {
          success: false,
          error: "Falha ao provisionar canal de transmissão. Tente em alguns segundos.",
        };
      }
    }

    const schedule = await db.liveSchedule.create({
      data: {
        botId: parsed.data.botId,
        title,
        description: description ?? null,
        price: (price ?? 0).toFixed(2),
        notifySubscribers: notifySubscribers ?? false,
        startAt,
        endAt,
        createdById: access.session.user.id,
      },
    });

    // Enfileira as 4 notificações do ciclo (T-10, T-5, T-1, T-0) quando a
    // modelo quer avisar os assinantes. Cada job só dispara se o schedule
    // ainda estiver scheduled/started no momento do firing.
    if (notifySubscribers) {
      try {
        const bot = await db.bot.findUnique({
          where: { id: parsed.data.botId },
          select: { telegramToken: true },
        });
        if (bot) {
          const token = decrypt(bot.telegramToken);
          scheduleLiveCountdownNotifications({
            botId: parsed.data.botId,
            token,
            title,
            scheduleId: schedule.id,
            startAt,
          });
        }
      } catch (e) {
        console.error(
          "[createLiveSchedule] falha ao enfileirar notificações:",
          e
        );
      }
    }

    revalidatePath(`/dashboard/bots/${parsed.data.botId}/live`);
    return { success: true, data: schedule };
  } catch (error) {
    console.error("[createLiveSchedule]", error);
    return { success: false, error: "Erro ao agendar live" };
  }
}

export async function updateLiveSchedule(
  id: string,
  input: UpdateLiveScheduleInput
): Promise<ActionResponse<LiveSchedule>> {
  try {
    const parsed = updateLiveScheduleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const current = await db.liveSchedule.findUnique({ where: { id } });
    if (!current) {
      return { success: false, error: "Agendamento não encontrado" };
    }
    if (current.status !== "scheduled") {
      return {
        success: false,
        error: `Só é possível editar agendamentos com status 'scheduled' (atual: ${current.status})`,
      };
    }

    const access = await assertBotAccess(current.botId);
    if (!access.ok) return { success: false, error: access.error };

    if (parsed.data.price !== undefined && parsed.data.price > 0) {
      const { assertMinTransactionPrice } = await import("@/lib/payment-limits");
      const minCheck = await assertMinTransactionPrice(parsed.data.price);
      if (!minCheck.ok) {
        return { success: false, error: minCheck.message };
      }
    }

    const newStartAt = parsed.data.startAt ?? current.startAt;
    const newEndAt = parsed.data.endAt ?? current.endAt;

    if (newEndAt <= newStartAt) {
      return { success: false, error: "Término deve ser depois do início" };
    }

    const minStart = new Date(Date.now() + MIN_ADVANCE_MINUTES * 60_000);
    if (newStartAt < minStart) {
      return {
        success: false,
        error: `O novo início precisa ser pelo menos ${MIN_ADVANCE_MINUTES} min no futuro`,
      };
    }

    const maxEnd = new Date(
      newStartAt.getTime() + MAX_DURATION_HOURS * 3600_000
    );
    if (newEndAt > maxEnd) {
      return {
        success: false,
        error: `Duração máxima permitida é ${MAX_DURATION_HOURS} horas`,
      };
    }

    const overlapping = await countOverlapping(newStartAt, newEndAt, id);
    if (overlapping >= MAX_CONCURRENT_LIVES) {
      return {
        success: false,
        error: `Horário cheio — já há ${overlapping} live(s) agendada(s) nesse período`,
      };
    }

    const updated = await db.liveSchedule.update({
      where: { id },
      data: {
        title: parsed.data.title ?? current.title,
        description:
          parsed.data.description !== undefined
            ? parsed.data.description
            : current.description,
        price:
          parsed.data.price !== undefined
            ? parsed.data.price.toFixed(2)
            : undefined,
        notifySubscribers:
          parsed.data.notifySubscribers ?? current.notifySubscribers,
        startAt: newStartAt,
        endAt: newEndAt,
      },
    });

    revalidatePath(`/dashboard/bots/${current.botId}/live`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("[updateLiveSchedule]", error);
    return { success: false, error: "Erro ao atualizar agendamento" };
  }
}

export async function cancelLiveSchedule(
  id: string
): Promise<ActionResponse<LiveSchedule>> {
  try {
    const current = await db.liveSchedule.findUnique({ where: { id } });
    if (!current) {
      return { success: false, error: "Agendamento não encontrado" };
    }
    if (current.status !== "scheduled") {
      return {
        success: false,
        error: `Não é possível cancelar — status atual: ${current.status}`,
      };
    }

    const access = await assertBotAccess(current.botId);
    if (!access.ok) return { success: false, error: access.error };

    const updated = await db.liveSchedule.update({
      where: { id },
      data: { status: "cancelled" },
    });

    revalidatePath(`/dashboard/bots/${current.botId}/live`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("[cancelLiveSchedule]", error);
    return { success: false, error: "Erro ao cancelar agendamento" };
  }
}

export async function listLiveSchedules(
  botId: string
): Promise<ActionResponse<LiveSchedule[]>> {
  try {
    const access = await assertBotAccess(botId);
    if (!access.ok) return { success: false, error: access.error };

    const schedules = await db.liveSchedule.findMany({
      where: { botId },
      orderBy: { startAt: "desc" },
      take: 50,
    });
    return { success: true, data: schedules };
  } catch (error) {
    console.error("[listLiveSchedules]", error);
    return { success: false, error: "Erro ao listar agendamentos" };
  }
}

export async function getLiveScheduleById(
  id: string
): Promise<ActionResponse<LiveSchedule>> {
  try {
    const schedule = await db.liveSchedule.findUnique({ where: { id } });
    if (!schedule) {
      return { success: false, error: "Agendamento não encontrado" };
    }
    const access = await assertBotAccess(schedule.botId);
    if (!access.ok) return { success: false, error: access.error };
    return { success: true, data: schedule };
  } catch (error) {
    console.error("[getLiveScheduleById]", error);
    return { success: false, error: "Erro ao buscar agendamento" };
  }
}

/**
 * Inicia um broadcast. Pré-condições:
 *  - Schedule existe e pertence ao creator (ou admin)
 *  - Status == scheduled
 *  - now >= startAt e now < endAt
 *  - Lives ativas atuais < MAX_CONCURRENT_LIVES
 *
 * Efeitos:
 *  - Cria path efêmero no MediaMTX (UUID único) — registra em schedule.mediamtxPath
 *  - Marca schedule.status = started e actualStartAt = now
 *  - Retorna { whipUrl } para o browser publicar via WebRTC
 */
export async function beginBrowserBroadcast(
  scheduleId: string
): Promise<ActionResponse<{ whipUrl: string; endAt: Date }>> {
  try {
    const schedule = await db.liveSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      return { success: false, error: "Agendamento não encontrado" };
    }

    const access = await assertBotAccess(schedule.botId);
    if (!access.ok) return { success: false, error: access.error };

    if (schedule.status !== "scheduled") {
      return {
        success: false,
        error: `Não é possível iniciar — status: ${schedule.status}`,
      };
    }

    const now = new Date();
    if (now < schedule.startAt) {
      return {
        success: false,
        error: "Ainda não chegou a hora agendada",
      };
    }
    if (now >= schedule.endAt) {
      return { success: false, error: "Horário do agendamento já terminou" };
    }

    // Segundo nível de defesa: checagem em tempo real
    const activeNow = await db.liveSchedule.count({
      where: { status: "started" },
    });
    if (activeNow >= MAX_CONCURRENT_LIVES) {
      return {
        success: false,
        error: `${MAX_CONCURRENT_LIVES} lives simultâneas no ar. Tente em alguns minutos.`,
      };
    }

    // Busca credenciais IVS do bot
    const liveStream = await db.liveStream.findUnique({
      where: { botId: schedule.botId },
    });
    if (
      !liveStream?.ivsIngestEndpoint ||
      !liveStream?.ivsStreamKeyEncrypted
    ) {
      return {
        success: false,
        error: "Canal IVS não provisionado para este bot",
      };
    }

    const streamKey = await getDecryptedStreamKey(
      liveStream.ivsStreamKeyEncrypted
    );

    const mediamtx = await createBroadcastPath({
      botId: schedule.botId,
      ivsIngestEndpoint: liveStream.ivsIngestEndpoint,
      ivsStreamKey: streamKey,
    });

    // Marca como started — condiciona ao status ainda ser scheduled pra
    // evitar race quando 2 requests vêm ao mesmo tempo.
    const updated = await db.liveSchedule.updateMany({
      where: { id: scheduleId, status: "scheduled" },
      data: {
        status: "started",
        actualStartAt: now,
        mediamtxPath: mediamtx.path,
      },
    });

    if (updated.count === 0) {
      // Alguém marcou como started antes — limpa o path que criamos
      await deleteBroadcastPath(mediamtx.path).catch(() => {});
      return {
        success: false,
        error: "Não foi possível iniciar — estado mudou. Recarregue a página.",
      };
    }

    // Sincroniza LiveStream com os dados do schedule. Isso é o que
    // o /live do bot e a UI /watch consultam — sem isso, os assinantes
    // que mandam /live recebem "nenhuma transmissão no momento" mesmo
    // durante o broadcast. Antes dependíamos só do webhook IVS, mas o
    // EventBridge não está sempre wired, então seta aqui como fonte
    // primária de verdade.
    await db.liveStream.update({
      where: { botId: schedule.botId },
      data: {
        isLive: true,
        title: schedule.title,
        description: schedule.description,
        price: schedule.price,
        notifySubscribers: schedule.notifySubscribers,
      },
    });

    // Dispara T-0 — agora acontece quando a transmissão *efetivamente*
    // começa, não só porque bateu o horário agendado. Assim o link sai
    // junto com a notificação de "AO VIVO", sem precisar digitar /live.
    if (schedule.notifySubscribers) {
      try {
        const bot = await db.bot.findUnique({
          where: { id: schedule.botId },
          select: { telegramToken: true },
        });
        if (bot) {
          const botToken = decrypt(bot.telegramToken);
          scheduleLiveBroadcast({
            botId: schedule.botId,
            token: botToken,
            title: schedule.title,
            scheduleId: schedule.id,
            kind: "T-0",
          });
        }
      } catch (e) {
        console.error(
          "[beginBrowserBroadcast] falha ao disparar notificação T-0:",
          e
        );
      }
    }

    revalidatePath(`/dashboard/bots/${schedule.botId}/live`);
    return {
      success: true,
      data: { whipUrl: mediamtx.whipUrl, endAt: schedule.endAt },
    };
  } catch (error) {
    console.error("[beginBrowserBroadcast]", error);
    return { success: false, error: "Erro ao iniciar transmissão" };
  }
}

/**
 * Encerra um broadcast em andamento. Chamado:
 *  - Pelo botão "Parar" do frontend
 *  - Pelo worker enforcer quando endAt passa
 *
 * Efeitos: deleta path do MediaMTX (ffmpeg morre junto), marca
 * schedule.status = ended e actualEndAt.
 */
export async function endBrowserBroadcast(
  scheduleId: string
): Promise<ActionResponse<LiveSchedule>> {
  try {
    const schedule = await db.liveSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      return { success: false, error: "Agendamento não encontrado" };
    }

    if (schedule.status !== "started") {
      return { success: true, data: schedule };
    }

    const access = await assertBotAccess(schedule.botId);
    if (!access.ok) return { success: false, error: access.error };

    if (schedule.mediamtxPath) {
      await deleteBroadcastPath(schedule.mediamtxPath).catch((e) => {
        console.error(
          "[endBrowserBroadcast] falha ao deletar path MediaMTX",
          e
        );
      });
    }

    const updated = await db.liveSchedule.update({
      where: { id: scheduleId },
      data: {
        status: "ended",
        actualEndAt: new Date(),
        mediamtxPath: null,
      },
    });

    // Marca LiveStream offline — /live do bot passa a responder "nenhuma
    // transmissão no momento". Ignora se já está offline (idempotente).
    await db.liveStream
      .update({ where: { botId: schedule.botId }, data: { isLive: false } })
      .catch(() => {});

    revalidatePath(`/dashboard/bots/${schedule.botId}/live`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("[endBrowserBroadcast]", error);
    return { success: false, error: "Erro ao encerrar transmissão" };
  }
}
