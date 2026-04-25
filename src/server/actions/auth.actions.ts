"use server";

import { hash, compare } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/s3";
import { getWooviSubAccountQueue } from "@/lib/queue";
import { ensureNoBlockingBalance } from "@/lib/withdraw-gate";
import { updateProfileSchema } from "@/lib/validations";
import type { UpdateProfileInput } from "@/lib/validations";
import type { ActionResponse } from "@/types";

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const { currentPassword, newPassword } = input;

    if (!currentPassword || !newPassword) {
      return { success: false, error: "Preencha todos os campos" };
    }

    if (newPassword.length < 6) {
      return { success: false, error: "Nova senha deve ter pelo menos 6 caracteres" };
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return { success: false, error: "Usuário não encontrado" };
    }

    const isValid = await compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Senha atual incorreta" };
    }

    if (currentPassword === newPassword) {
      return { success: false, error: "A nova senha deve ser diferente da atual" };
    }

    const passwordHash = await hash(newPassword, 12);

    await db.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[changePassword]", error);
    return { success: false, error: "Erro interno ao alterar senha" };
  }
}

export async function updateProfile(
  input: UpdateProfileInput
): Promise<
  ActionResponse<{
    id: string;
    email: string;
    name: string;
    cpf: string | null;
    phone: string | null;
    pixKey: string | null;
    pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
  }>
> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const userId = session.user.id;
    const data = parsed.data;
    const temCampo =
      data.name !== undefined ||
      data.email !== undefined ||
      data.cpf !== undefined ||
      data.phone !== undefined ||
      data.pixKey !== undefined;
    if (!temCampo) {
      return { success: false, error: "Nenhum campo para atualizar" };
    }

    // Dados de pagamento (cpf/phone/pixKey) só pra creator/manager.
    const pedePagamento =
      data.cpf !== undefined || data.phone !== undefined || data.pixKey !== undefined;
    if (pedePagamento) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user || (user.role !== "creator" && user.role !== "manager")) {
        return {
          success: false,
          error: "Dados de pagamento só se aplicam a creator ou gestor",
        };
      }
    }

    if (data.email) {
      const existing = await db.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== userId) {
        return { success: false, error: "Email já está em uso" };
      }
    }

    const updateData: Partial<{
      name: string;
      email: string;
      cpf: string | null;
      phone: string | null;
      pixKey: string | null;
      pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.cpf !== undefined) updateData.cpf = data.cpf;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.pixKey !== undefined) updateData.pixKey = data.pixKey;
    if (data.pixKeyType !== undefined) updateData.pixKeyType = data.pixKeyType;

    const pixKeyTouched = data.pixKey !== undefined;
    if (pixKeyTouched) {
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
        cpf: true,
        phone: true,
        pixKey: true,
        pixKeyType: true,
      },
    });

    if (data.pixKey) {
      try {
        const pixKeyHash = Buffer.from(data.pixKey).toString("base64url").slice(0, 16);
        await getWooviSubAccountQueue().add(
          "provision",
          { userId },
          { jobId: `provision-${userId}-${pixKeyHash}` }
        );
      } catch (e) {
        console.error("[updateProfile] falha ao enfileirar woovi-subaccount:", e);
      }
    }

    revalidatePath("/dashboard/settings");

    return { success: true, data: updated };
  } catch (error) {
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
    console.error("[updateProfile]", error);
    return { success: false, error: "Erro interno ao atualizar perfil" };
  }
}

/**
 * Reenfileira o provisionamento da subconta Woovi quando o status é
 * failed/none. Usado pelo botão "Tentar provisionar novamente" tanto
 * em /dashboard/settings (self) quanto em /admin/users/[id] (admin).
 *
 * - Self (sem targetUserId): age sobre o próprio usuário; só permite
 *   creator/manager.
 * - Admin (com targetUserId): owner/admin pode reprocessar qualquer
 *   creator/manager.
 */
export async function retryWooviProvisioning(
  targetUserId?: string
): Promise<ActionResponse<{ status: "pending" }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const isAdmin =
      session.user.role === "owner" || session.user.role === "admin";
    const userId = isAdmin && targetUserId ? targetUserId : session.user.id;

    // Quando self-targeting (sem targetUserId), só creator/manager podem.
    if (
      !isAdmin &&
      session.user.role !== "creator" &&
      session.user.role !== "manager"
    ) {
      return { success: false, error: "Sem permissão" };
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        pixKey: true,
        wooviSubAccountStatus: true,
      },
    });
    if (!user) {
      return { success: false, error: "Usuário não encontrado" };
    }
    if (user.role !== "creator" && user.role !== "manager") {
      return {
        success: false,
        error: "Conta BotFans só se aplica a creator ou gestor",
      };
    }
    if (!user.pixKey) {
      return {
        success: false,
        error: "Cadastre uma chave Pix antes de tentar provisionar",
      };
    }
    if (user.wooviSubAccountStatus === "active") {
      return { success: false, error: "Subconta já está ativa" };
    }

    // Marca pending + limpa erro anterior pra UI refletir antes do worker rodar.
    await db.user.update({
      where: { id: userId },
      data: {
        wooviSubAccountStatus: "pending",
        wooviSubAccountError: null,
      },
    });

    // jobId com timestamp garante que sempre enfileira (não esbarra em
    // dedup do BullMQ caso jobId determinístico anterior ainda exista).
    try {
      const pixKeyHash = Buffer.from(user.pixKey).toString("base64url").slice(0, 16);
      await getWooviSubAccountQueue().add(
        "provision",
        { userId },
        { jobId: `provision-${userId}-${pixKeyHash}-retry-${Date.now()}` }
      );
    } catch (e) {
      console.error("[retryWooviProvisioning] enqueue falhou:", e);
      return { success: false, error: "Erro ao enfileirar provisionamento" };
    }

    revalidatePath("/dashboard/settings");
    if (isAdmin && targetUserId) {
      revalidatePath(`/admin/users/${targetUserId}`);
    }

    return { success: true, data: { status: "pending" } };
  } catch (error) {
    console.error("[retryWooviProvisioning]", error);
    return { success: false, error: "Erro ao tentar provisionar de novo" };
  }
}

/** Retorna os dados de pagamento do usuário logado. Usado na tela de configurações. */
export async function getPaymentInfo(): Promise<
  ActionResponse<{
    role: string;
    cpf: string | null;
    phone: string | null;
    pixKey: string | null;
    pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
    wooviSubAccountStatus: "none" | "pending" | "active" | "failed";
    wooviSubAccountError: string | null;
    wooviSubAccountProvisionedAt: Date | null;
  }>
> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        cpf: true,
        phone: true,
        pixKey: true,
        pixKeyType: true,
        wooviSubAccountStatus: true,
        wooviSubAccountError: true,
        wooviSubAccountProvisionedAt: true,
      },
    });
    if (!user) return { success: false, error: "Usuário não encontrado" };
    return { success: true, data: user };
  } catch (error) {
    console.error("[getPaymentInfo]", error);
    return { success: false, error: "Erro ao buscar dados de pagamento" };
  }
}

export async function updateAvatar(
  avatarKey: string,
  targetUserId?: string
): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const isAdmin = session.user.role === "owner" || session.user.role === "admin";
    const userId = isAdmin && targetUserId ? targetUserId : session.user.id;

    // Remover avatar antigo do S3
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    if (user?.avatarKey) {
      await deleteObject(user.avatarKey).catch(() => {});
    }

    await db.user.update({
      where: { id: userId },
      data: { avatarKey, avatarUrl: avatarKey, updatedAt: new Date() },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("[updateAvatar]", error);
    return { success: false, error: "Erro ao atualizar avatar" };
  }
}

export async function updateDocuments(input: {
  docType: string;
  docFrontKey: string;
  docBackKey: string;
  docSelfieKey: string;
  targetUserId?: string;
}): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const validDocTypes = ["rg", "rne", "cpf"];
    if (!validDocTypes.includes(input.docType)) {
      return { success: false, error: "Tipo de documento inválido" };
    }

    const isAdmin = session.user.role === "owner" || session.user.role === "admin";
    const userId = isAdmin && input.targetUserId ? input.targetUserId : session.user.id;

    // Remover documentos antigos do S3
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { docFrontKey: true, docBackKey: true, docSelfieKey: true },
    });
    if (user) {
      const oldKeys = [user.docFrontKey, user.docBackKey, user.docSelfieKey].filter(Boolean) as string[];
      await Promise.allSettled(oldKeys.map((k) => deleteObject(k)));
    }

    await db.user.update({
      where: { id: userId },
      data: {
        docType: input.docType,
        docFrontKey: input.docFrontKey,
        docBackKey: input.docBackKey,
        docSelfieKey: input.docSelfieKey,
        docStatus: "pending",
        docRejectReason: null,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("[updateDocuments]", error);
    return { success: false, error: "Erro ao atualizar documentos" };
  }
}

export async function getUserDocumentInfo(): Promise<
  ActionResponse<{
    avatarKey: string | null;
    docType: string | null;
    docFrontKey: string | null;
    docBackKey: string | null;
    docSelfieKey: string | null;
    docStatus: string;
    docRejectReason: string | null;
  }>
> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        avatarKey: true,
        docType: true,
        docFrontKey: true,
        docBackKey: true,
        docSelfieKey: true,
        docStatus: true,
        docRejectReason: true,
      },
    });

    if (!user) {
      return { success: false, error: "Usuário não encontrado" };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error("[getUserDocumentInfo]", error);
    return { success: false, error: "Erro ao buscar informações" };
  }
}
