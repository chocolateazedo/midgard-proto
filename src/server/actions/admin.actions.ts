"use server";

import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, decrypt, maskValue } from "@/lib/crypto";
import { deleteObject } from "@/lib/s3";
import { getWooviSubAccountQueue } from "@/lib/queue";
import { ensureNoBlockingBalance } from "@/lib/withdraw-gate";
import { updateUserSchema, createUserWithBotSchema } from "@/lib/validations";
import type { UpdateUserInput, CreateUserWithBotInput } from "@/lib/validations";
import { botManager } from "@/lib/telegram";
import { getUserById } from "@/server/queries/users";
import type { ActionResponse, User } from "@/types";

// Keys that contain sensitive values and should always be masked when returned
const SENSITIVE_SETTING_KEYS = new Set([
  "storage_access_key_id",
  "storage_secret_access_key",
  "pix_access_token",
  "pix_webhook_secret",
]);

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

function buildWebhookUrl(botId: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/api/webhooks/telegram/${botId}`;
}

export async function createUserWithBot(
  input: CreateUserWithBotInput
): Promise<ActionResponse<{ userId: string; botId: string; email: string }>> {
  try {
    const { error } = await requireAdminSession();
    if (error) {
      return { success: false, error };
    }

    const parsed = createUserWithBotSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const { name, email, password, botName, botToken, botDescription } = parsed.data;

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return { success: false, error: "Email já cadastrado" };
    }

    // Validate bot token with Telegram API
    let botInfo;
    try {
      botInfo = await botManager.getBotInfo(botToken);
    } catch {
      return { success: false, error: "Token do bot Telegram inválido. Verifique o token do BotFather." };
    }

    // Hash password and encrypt token
    const passwordHash = await hash(password, 12);
    const encryptedToken = encrypt(botToken);

    // Create user
    const newUser = await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "creator",
        isActive: false,
        docStatus: "none",
        mustChangePassword: true,
      },
    });

    // Create bot
    const newBot = await db.bot.create({
      data: {
        userId: newUser.id,
        name: botName,
        username: botInfo.username,
        telegramToken: encryptedToken,
        description: botDescription ?? null,
        isActive: false,
      },
    });

    // Try to set webhook and activate
    const webhookUrl = buildWebhookUrl(newBot.id);
    try {
      await botManager.setWebhook(botToken, webhookUrl);
      await db.bot.update({
        where: { id: newBot.id },
        data: { webhookUrl, isActive: true, updatedAt: new Date() },
      });
    } catch (webhookError) {
      console.error("[createUserWithBot] webhook error", webhookError);
      // Bot created but webhook failed — can reactivate later
    }

    revalidatePath("/admin/users");

    return {
      success: true,
      data: { userId: newUser.id, botId: newBot.id, email: newUser.email },
    };
  } catch (error) {
    console.error("[createUserWithBot]", error);
    return { success: false, error: "Erro interno ao criar usuário" };
  }
}

/**
 * Cria um manager (gestor de criadores). Sem bot associado.
 * Só owner/admin pode chamar.
 */
export async function createManager(input: {
  name: string;
  email: string;
  password: string;
  platformFeePercent?: number;
}): Promise<ActionResponse<{ userId: string; email: string }>> {
  try {
    const { error } = await requireAdminSession();
    if (error) return { success: false, error };

    if (!input.name || input.name.length < 2) {
      return { success: false, error: "Nome deve ter pelo menos 2 caracteres" };
    }
    if (!input.email || !input.email.includes("@")) {
      return { success: false, error: "Email inválido" };
    }
    if (!input.password || input.password.length < 6) {
      return { success: false, error: "Senha deve ter pelo menos 6 caracteres" };
    }

    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) return { success: false, error: "Email já cadastrado" };

    const passwordHash = await hash(input.password, 12);

    const newUser = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "manager",
        isActive: true,
        docStatus: "approved",
        mustChangePassword: true,
        platformFeePercent: String(input.platformFeePercent ?? 10),
      },
    });

    revalidatePath("/admin/users");
    return { success: true, data: { userId: newUser.id, email: newUser.email } };
  } catch (error) {
    console.error("[createManager]", error);
    return { success: false, error: "Erro interno ao criar gestor" };
  }
}

/**
 * Remove um manager com escolha de comportamento sobre seus creators:
 * - strategy "cascade": deleta os creators junto (bots, conteúdos etc. via FK onDelete Cascade).
 * - strategy "promote": zera managedByUserId dos creators (viram standalone) e remove só o manager.
 */
export async function deleteManager(
  userId: string,
  strategy: "cascade" | "promote"
): Promise<ActionResponse<{ affectedCreators: number }>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    const manager = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!manager || manager.role !== "manager") {
      return { success: false, error: "Usuário não é um gestor" };
    }

    const creators = await db.user.findMany({
      where: { managedByUserId: userId },
      select: { id: true },
    });

    if (strategy === "cascade" && creators.length > 0) {
      await db.user.deleteMany({ where: { id: { in: creators.map((c) => c.id) } } });
    } else if (strategy === "promote" && creators.length > 0) {
      await db.user.updateMany({
        where: { managedByUserId: userId },
        data: { managedByUserId: null, managerFeePercent: null },
      });
    }

    await db.user.delete({ where: { id: userId } });

    revalidatePath("/admin/users");
    return { success: true, data: { affectedCreators: creators.length } };
  } catch (error) {
    console.error("[deleteManager]", error);
    return { success: false, error: "Erro interno ao excluir gestor" };
  }
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput
): Promise<ActionResponse<Omit<User, "passwordHash">>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const existing = await getUserById(userId);
    if (!existing) {
      return { success: false, error: "Usuário não encontrado" };
    }

    // Prevent non-owner admins from modifying owner accounts
    if (
      existing.role === "owner" &&
      session.user.role !== "owner"
    ) {
      return {
        success: false,
        error: "Apenas o owner pode modificar contas owner",
      };
    }

    // Prevent promoting to owner unless caller is also owner
    if (parsed.data.role === "owner" && session.user.role !== "owner") {
      return {
        success: false,
        error: "Apenas o owner pode conceder role de owner",
      };
    }

    // Dados de pagamento só fazem sentido para creator/manager.
    const roleAlvo = parsed.data.role ?? existing.role;
    const aceitaPagamento = roleAlvo === "creator" || roleAlvo === "manager";
    const querSetarPagamento =
      parsed.data.cpf !== undefined ||
      parsed.data.phone !== undefined ||
      parsed.data.pixKey !== undefined;
    if (querSetarPagamento && !aceitaPagamento) {
      return {
        success: false,
        error: "Dados de pagamento só se aplicam a creator ou gestor",
      };
    }

    const updateData: Partial<{
      name: string;
      email: string;
      role: "owner" | "admin" | "manager" | "creator";
      isActive: boolean;
      platformFeePercent: string;
      managerFeePercent: string | null;
      managedByUserId: string | null;
      cpf: string | null;
      phone: string | null;
      pixKey: string | null;
      pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.isActive !== undefined)
      updateData.isActive = parsed.data.isActive;
    if (parsed.data.platformFeePercent !== undefined)
      updateData.platformFeePercent = String(parsed.data.platformFeePercent);
    if (parsed.data.managerFeePercent !== undefined)
      updateData.managerFeePercent =
        parsed.data.managerFeePercent === null ? null : String(parsed.data.managerFeePercent);
    if (parsed.data.managedByUserId !== undefined)
      updateData.managedByUserId = parsed.data.managedByUserId;
    if (parsed.data.cpf !== undefined) updateData.cpf = parsed.data.cpf;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.pixKey !== undefined) updateData.pixKey = parsed.data.pixKey;
    if (parsed.data.pixKeyType !== undefined)
      updateData.pixKeyType = parsed.data.pixKeyType;

    // Quando pixKey é trocado/removido, invalidamos o estado da subconta
    // Woovi pra refletir que ela será reprovisionada (evita mostrar "active"
    // com chave nova).
    const pixKeyTouched = parsed.data.pixKey !== undefined;
    if (pixKeyTouched) {
      // Trava: subconta ativa com saldo > 0 precisa sacar antes de trocar.
      const gate = await ensureNoBlockingBalance(userId);
      if (!gate.ok) {
        return { success: false, error: gate.message };
      }
      (updateData as Record<string, unknown>).wooviSubAccountStatus = "none";
      (updateData as Record<string, unknown>).wooviSubAccountError = null;
      (updateData as Record<string, unknown>).wooviSubAccountProvisionedAt = null;
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        platformFeePercent: true,
        cpf: true,
        phone: true,
        pixKey: true,
        pixKeyType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Enfileira provisionamento da subconta Woovi quando pixKey mudou
    // e ficou populada. Quando limpa (null), worker zera status
    // ao processar. Ignora falha de enqueue — UI não bloqueia.
    if (parsed.data.pixKey) {
      try {
        // jobId = userId + hash(pixKey) dedupa saves repetidos da mesma chave
        // mas permite re-enfileirar quando chave muda.
        const pixKeyHash = Buffer.from(parsed.data.pixKey).toString("base64url").slice(0, 16);
        await getWooviSubAccountQueue().add(
          "provision",
          { userId },
          { jobId: `provision-${userId}-${pixKeyHash}` }
        );
      } catch (e) {
        console.error("[updateUser] falha ao enfileirar woovi-subaccount:", e);
      }
    }

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);

    return { success: true, data: updated as Omit<User, "passwordHash"> };
  } catch (error) {
    // P2002 = unique constraint violation. Meta.target lista as colunas conflitantes.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const target = (error as { meta?: { target?: string[] } }).meta?.target ?? [];
      if (target.includes("cpf")) {
        return { success: false, error: "Este CPF já está cadastrado em outra conta" };
      }
      if (target.includes("pix_key")) {
        return { success: false, error: "Esta chave Pix já está cadastrada em outra conta" };
      }
      if (target.includes("email")) {
        return { success: false, error: "Este email já está em uso" };
      }
    }
    console.error("[updateUser]", error);
    return { success: false, error: "Erro interno ao atualizar usuário" };
  }
}

export async function resetUserPassword(
  userId: string
): Promise<ActionResponse<{ temporaryPassword: string }>> {
  try {
    const { error } = await requireAdminSession();
    if (error) {
      return { success: false, error };
    }

    const existing = await getUserById(userId);
    if (!existing) {
      return { success: false, error: "Usuário não encontrado" };
    }

    // Generate a random 12-character alphanumeric password
    const temporaryPassword = randomBytes(9).toString("base64url").slice(0, 12);
    const passwordHash = await hash(temporaryPassword, 12);

    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);

    return { success: true, data: { temporaryPassword } };
  } catch (error) {
    console.error("[resetUserPassword]", error);
    return { success: false, error: "Erro interno ao resetar senha" };
  }
}

export async function deleteUser(
  userId: string
): Promise<ActionResponse<undefined>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    // Prevent self-deletion
    if (session.user.id === userId) {
      return { success: false, error: "Não é possível excluir sua própria conta" };
    }

    const existing = await getUserById(userId);
    if (!existing) {
      return { success: false, error: "Usuário não encontrado" };
    }

    // Prevent deletion of owner accounts by non-owners
    if (existing.role === "owner" && session.user.role !== "owner") {
      return {
        success: false,
        error: "Apenas o owner pode excluir contas owner",
      };
    }

    await db.user.delete({ where: { id: userId } });

    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("[deleteUser]", error);
    return { success: false, error: "Erro interno ao excluir usuário" };
  }
}

export async function updatePlatformSetting(
  key: string,
  value: string,
  isEncryptedFlag: boolean
): Promise<ActionResponse<undefined>> {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) {
      return { success: false, error: error ?? "Não autenticado" };
    }

    if (!key.trim()) {
      return { success: false, error: "Chave de configuração inválida" };
    }

    const storedValue = isEncryptedFlag ? encrypt(value) : value;

    await db.platformSetting.upsert({
      where: { key },
      create: {
        key,
        value: storedValue,
        isEncrypted: isEncryptedFlag,
        updatedBy: session.user.id,
      },
      update: {
        value: storedValue,
        isEncrypted: isEncryptedFlag,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/settings");

    return { success: true };
  } catch (error) {
    console.error("[updatePlatformSetting]", error);
    return { success: false, error: "Erro interno ao salvar configuração" };
  }
}

export async function approveUserDocuments(
  userId: string
): Promise<ActionResponse<undefined>> {
  try {
    const { error } = await requireAdminSession();
    if (error) return { success: false, error };

    await db.user.update({
      where: { id: userId },
      data: {
        docStatus: "approved",
        docRejectReason: null,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/pending");

    return { success: true };
  } catch (error) {
    console.error("[approveUserDocuments]", error);
    return { success: false, error: "Erro ao aprovar documentos" };
  }
}

export async function rejectUserDocuments(
  userId: string,
  reason: string
): Promise<ActionResponse<undefined>> {
  try {
    const { error } = await requireAdminSession();
    if (error) return { success: false, error };

    // Remover documentos do S3
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { docFrontKey: true, docBackKey: true, docSelfieKey: true },
    });
    if (user) {
      const keys = [user.docFrontKey, user.docBackKey, user.docSelfieKey].filter(Boolean) as string[];
      await Promise.allSettled(keys.map((k) => deleteObject(k)));
    }

    await db.user.update({
      where: { id: userId },
      data: {
        docStatus: "rejected",
        docRejectReason: reason || "Documentos recusados. Por favor, reenvie.",
        docType: null,
        docFrontKey: null,
        docBackKey: null,
        docSelfieKey: null,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/pending");

    return { success: true };
  } catch (error) {
    console.error("[rejectUserDocuments]", error);
    return { success: false, error: "Erro ao rejeitar documentos" };
  }
}

export async function getPendingDocumentRequests(): Promise<
  ActionResponse<Array<{
    id: string;
    name: string;
    email: string;
    docType: string | null;
    docFrontKey: string | null;
    docBackKey: string | null;
    docSelfieKey: string | null;
    createdAt: Date;
  }>>
> {
  try {
    const { error } = await requireAdminSession();
    if (error) return { success: false, error };

    const users = await db.user.findMany({
      where: { docStatus: "pending" },
      select: {
        id: true,
        name: true,
        email: true,
        docType: true,
        docFrontKey: true,
        docBackKey: true,
        docSelfieKey: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data: users };
  } catch (error) {
    console.error("[getPendingDocumentRequests]", error);
    return { success: false, error: "Erro ao buscar pendentes" };
  }
}

export async function getPlatformSettings(): Promise<
  ActionResponse<
    Array<{
      id: string;
      key: string;
      value: string;
      description: string | null;
      isEncrypted: boolean | null;
      updatedAt: Date | null;
    }>
  >
> {
  try {
    const { error } = await requireAdminSession();
    if (error) {
      return { success: false, error };
    }

    const settings = await db.platformSetting.findMany();

    const masked = settings.map((s) => {
      let displayValue = s.value;

      if (s.isEncrypted || SENSITIVE_SETTING_KEYS.has(s.key)) {
        try {
          // Decrypt to apply masking so length is representative
          const plain = s.isEncrypted ? decrypt(s.value) : s.value;
          displayValue = maskValue(plain);
        } catch {
          displayValue = "****";
        }
      }

      return {
        id: s.id,
        key: s.key,
        value: displayValue,
        description: s.description,
        isEncrypted: s.isEncrypted,
        updatedAt: s.updatedAt,
      };
    });

    return { success: true, data: masked };
  } catch (error) {
    console.error("[getPlatformSettings]", error);
    return { success: false, error: "Erro interno ao buscar configurações" };
  }
}
