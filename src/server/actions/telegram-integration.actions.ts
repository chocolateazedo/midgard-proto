"use server";

import { randomBytes } from "crypto";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  disconnect as mtprotoDisconnect,
  getStatus as mtprotoGetStatus,
  joinAllBotChannels as mtprotoJoinAllBotChannels,
  listMtprotoChannelMembership as mtprotoListChannelMembership,
  startLogin as mtprotoStartLogin,
  syncBotsChannelsViaMtproto as mtprotoSyncBotsChannels,
  verifyCode as mtprotoVerifyCode,
  type ChannelMembershipItem,
  type JoinAllChannelsResult,
  type SyncChannelsResult,
  type TelegramStatus,
} from "@/lib/telegram-mtproto";
import type { ActionResponse } from "@/types";

type AdminGuard =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function requireAdmin(): Promise<AdminGuard> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Não autenticado" };
  }
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { ok: false, error: "Sem permissão de administrador" };
  }
  return { ok: true, userId: session.user.id };
}

export async function getTelegramIntegrationStatus(): Promise<
  ActionResponse<TelegramStatus>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    const status = await mtprotoGetStatus();
    return { success: true, data: status };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function startTelegramLogin(input: {
  apiId: number;
  apiHash: string;
  phone: string;
}): Promise<ActionResponse<{ phoneCodeHash: string; isCodeViaApp: boolean }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    const result = await mtprotoStartLogin(input, guard.userId);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function verifyTelegramCode(input: {
  phone: string;
  phoneCodeHash: string;
  code: string;
  password?: string;
}): Promise<ActionResponse<{ username: string | null; firstName: string | null }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    const result = await mtprotoVerifyCode(input, guard.userId);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function disconnectTelegram(): Promise<ActionResponse<undefined>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    await mtprotoDisconnect(guard.userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function getMtprotoChannelsMembership(): Promise<
  ActionResponse<ChannelMembershipItem[]>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    const items = await mtprotoListChannelMembership();
    return { success: true, data: items };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function syncBotChannelsViaMtproto(): Promise<
  ActionResponse<SyncChannelsResult>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    const result = await mtprotoSyncBotsChannels();
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function joinAllChannelsAsMtproto(): Promise<
  ActionResponse<JoinAllChannelsResult>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    const result = await mtprotoJoinAllBotChannels();
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function rotateIntegrationSecret(): Promise<ActionResponse<{ secret: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    // 32 bytes de aleatoriedade → 44 chars base64url (sem padding)
    const secret = randomBytes(32).toString("base64url");
    await db.platformSetting.upsert({
      where: { key: "integration_secret" },
      create: {
        key: "integration_secret",
        value: secret,
        isEncrypted: false,
        updatedBy: guard.userId,
        description:
          "Shared secret para autenticação do endpoint /api/integrations/provision-bot (Bearer)",
      },
      update: {
        value: secret,
        isEncrypted: false,
        updatedBy: guard.userId,
        updatedAt: new Date(),
      },
    });
    return { success: true, data: { secret } };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

export async function updateProvisioningRateLimit(input: {
  maxPerHour: number;
}): Promise<ActionResponse<undefined>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  if (!Number.isInteger(input.maxPerHour) || input.maxPerHour < 1 || input.maxPerHour > 500) {
    return { success: false, error: "Limite deve ser inteiro entre 1 e 500" };
  }
  try {
    await db.platformSetting.upsert({
      where: { key: "bot_provisioning_max_per_hour" },
      create: {
        key: "bot_provisioning_max_per_hour",
        value: String(input.maxPerHour),
        isEncrypted: false,
        updatedBy: guard.userId,
        description: "Limite de bots criados por hora via endpoint de integração",
      },
      update: {
        value: String(input.maxPerHour),
        updatedBy: guard.userId,
        updatedAt: new Date(),
      },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: toMessage(err) };
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
