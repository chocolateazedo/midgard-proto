"use server";

import { hash, compare } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
