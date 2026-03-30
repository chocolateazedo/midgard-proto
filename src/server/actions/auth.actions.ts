"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validations";
import type { RegisterInput } from "@/lib/validations";
import type { ActionResponse } from "@/types";

export async function registerUser(
  input: RegisterInput
): Promise<ActionResponse<{ id: string; email: string; name: string }>> {
  try {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const { name, email, password } = parsed.data;

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing) {
      return { success: false, error: "Email já cadastrado" };
    }

    const passwordHash = await hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: "creator",
        isActive: true,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    return {
      success: true,
      data: newUser,
    };
  } catch (error) {
    console.error("[registerUser]", error);
    return { success: false, error: "Erro interno ao criar conta" };
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
      const existing = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });
      if (existing && existing.id !== userId) {
        return { success: false, error: "Email já está em uso" };
      }
    }

    const updateData: Partial<{ name: string; email: string; updatedAt: Date }> =
      { updatedAt: new Date() };

    if (input.name) updateData.name = input.name;
    if (input.email) updateData.email = input.email;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, name: users.name });

    revalidatePath("/dashboard/settings");

    return { success: true, data: updated };
  } catch (error) {
    console.error("[updateProfile]", error);
    return { success: false, error: "Erro interno ao atualizar perfil" };
  }
}
