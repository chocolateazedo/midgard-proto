"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { testConnection, invalidateStorageCache } from "@/lib/s3";
import { storageSettingsSchema, pixSettingsSchema } from "@/lib/validations";
import type { StorageSettingsInput, PixSettingsInput } from "@/lib/validations";
import type { ActionResponse } from "@/types";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Não autenticado" };
  }
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { error: "Sem permissão de administrador" };
  }
  return { session };
}

/**
 * Upsert a single platform setting. Encrypts the value when isEncrypted is true.
 */
async function upsertSetting(
  key: string,
  value: string,
  isEncrypted: boolean,
  updatedBy: string,
  description?: string
): Promise<void> {
  const storedValue = isEncrypted ? encrypt(value) : value;

  const existing = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.key, key),
  });

  if (existing) {
    await db
      .update(platformSettings)
      .set({
        value: storedValue,
        isEncrypted,
        updatedBy,
        updatedAt: new Date(),
        ...(description !== undefined ? { description } : {}),
      })
      .where(eq(platformSettings.key, key));
  } else {
    await db.insert(platformSettings).values({
      key,
      value: storedValue,
      isEncrypted,
      updatedBy,
      ...(description !== undefined ? { description } : {}),
    });
  }
}

export async function updateStorageSettings(
  input: StorageSettingsInput
): Promise<ActionResponse<undefined>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    const parsed = storageSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const {
      provider,
      bucket,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl,
    } = parsed.data;

    const userId = session.user.id;

    await Promise.all([
      upsertSetting("storage_provider", provider, false, userId, "Storage provider (s3 or wasabi)"),
      upsertSetting("storage_bucket", bucket, false, userId, "Storage bucket name"),
      upsertSetting("storage_region", region, false, userId, "Storage region"),
      upsertSetting("storage_endpoint", endpoint ?? "", false, userId, "Custom endpoint URL (for Wasabi)"),
      upsertSetting("storage_access_key_id", accessKeyId, true, userId, "Storage access key ID (encrypted)"),
      upsertSetting("storage_secret_access_key", secretAccessKey, true, userId, "Storage secret access key (encrypted)"),
      upsertSetting("storage_public_base_url", publicBaseUrl ?? "", false, userId, "Public base URL for storage"),
    ]);

    // Invalidate S3 client cache so next request picks up new config
    invalidateStorageCache();

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/storage");

    return { success: true };
  } catch (error) {
    console.error("[updateStorageSettings]", error);
    return {
      success: false,
      error: "Erro interno ao salvar configurações de storage",
    };
  }
}

export async function updatePixSettings(
  input: PixSettingsInput
): Promise<ActionResponse<undefined>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    const parsed = pixSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const { provider, accessToken, webhookSecret } = parsed.data;
    const userId = session.user.id;

    await Promise.all([
      upsertSetting("pix_provider", provider, false, userId, "Pix PSP provider"),
      upsertSetting("pix_access_token", accessToken, true, userId, "Pix access token (encrypted)"),
      upsertSetting(
        "pix_webhook_secret",
        webhookSecret ?? "",
        webhookSecret ? true : false,
        userId,
        "Pix webhook secret (encrypted)"
      ),
    ]);

    revalidatePath("/admin/settings");

    return { success: true };
  } catch (error) {
    console.error("[updatePixSettings]", error);
    return {
      success: false,
      error: "Erro interno ao salvar configurações Pix",
    };
  }
}

export async function testStorageConnection(): Promise<
  ActionResponse<{ message: string }>
> {
  try {
    const { error } = await requireAdminSession();
    if (error) {
      return { success: false, error };
    }

    const result = await testConnection();

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Falha ao conectar ao storage",
      };
    }

    return {
      success: true,
      data: { message: "Conexão com storage estabelecida com sucesso" },
    };
  } catch (error) {
    console.error("[testStorageConnection]", error);
    return { success: false, error: "Erro interno ao testar conexão de storage" };
  }
}

export async function updateTelegramSettings(input: {
  defaultWelcomeMessage: string;
  webhookBaseUrl: string;
}): Promise<ActionResponse<undefined>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    if (!input.defaultWelcomeMessage.trim()) {
      return { success: false, error: "Mensagem de boas-vindas é obrigatória" };
    }

    if (!input.webhookBaseUrl.trim()) {
      return { success: false, error: "URL base de webhook é obrigatória" };
    }

    const userId = session.user.id;

    await Promise.all([
      upsertSetting(
        "telegram_default_welcome_message",
        input.defaultWelcomeMessage,
        false,
        userId,
        "Default Telegram welcome message (supports Telegram Markdown)"
      ),
      upsertSetting(
        "telegram_webhook_base_url",
        input.webhookBaseUrl,
        false,
        userId,
        "Base URL used to construct Telegram webhook URLs"
      ),
    ]);

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/telegram");

    return { success: true };
  } catch (error) {
    console.error("[updateTelegramSettings]", error);
    return {
      success: false,
      error: "Erro interno ao salvar configurações do Telegram",
    };
  }
}
