"use server";

import { hash, compare } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/s3";
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

export async function updateProfile(input: {
  name?: string;
  email?: string;
}): Promise<ActionResponse<{ id: string; email: string; name: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const userId = session.user.id;

    if (!input.name && !input.email) {
      return { success: false, error: "Nenhum campo para atualizar" };
    }

    if (input.email) {
      const existing = await db.user.findUnique({
        where: { email: input.email },
      });
      if (existing && existing.id !== userId) {
        return { success: false, error: "Email já está em uso" };
      }
    }

    const updateData: Partial<{ name: string; email: string; updatedAt: Date }> =
      { updatedAt: new Date() };

    if (input.name) updateData.name = input.name;
    if (input.email) updateData.email = input.email;

    const updated = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, name: true },
    });

    revalidatePath("/dashboard/settings");

    return { success: true, data: updated };
  } catch (error) {
    console.error("[updateProfile]", error);
    return { success: false, error: "Erro interno ao atualizar perfil" };
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
