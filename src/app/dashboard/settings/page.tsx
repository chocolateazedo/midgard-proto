"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";
import { z } from "zod";

import { updateProfile } from "@/server/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
});

type ProfileInput = z.infer<typeof profileSchema>;

export default function DashboardSettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });

  useEffect(() => {
    if (session?.user) {
      reset({
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      });
    }
  }, [session, reset]);

  async function onSubmit(data: ProfileInput) {
    setIsSaving(true);
    try {
      const result = await updateProfile(data);

      if (!result.success) {
        toast.error(result.error ?? "Erro ao atualizar perfil");
        return;
      }

      toast.success("Perfil atualizado com sucesso!");

      // Update session data
      await updateSession({
        name: data.name,
        email: data.email,
      });

      reset(data);
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações da Conta</h1>
        <p className="text-sm text-slate-400">
          Gerencie suas informações pessoais
        </p>
      </div>

      {/* Avatar & Name Preview */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardContent className="flex items-center gap-4 py-5">
          <Avatar className="h-16 w-16">
            <AvatarImage src={session?.user?.image ?? undefined} />
            <AvatarFallback className="bg-primary-100 text-primary-600 text-lg font-semibold">
              {session?.user?.name ? getInitials(session.user.name) : <User className="h-6 w-6" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-slate-900">
              {session?.user?.name ?? "—"}
            </p>
            <p className="text-sm text-slate-400">{session?.user?.email ?? "—"}</p>
            <div className="mt-1">
              <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
                {session?.user?.role === "owner"
                  ? "Proprietário"
                  : session?.user?.role === "admin"
                  ? "Administrador"
                  : "Creator"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Form */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base">Informações Pessoais</CardTitle>
          <CardDescription className="text-slate-400">
            Atualize seu nome e endereço de email
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700">
                Nome
              </Label>
              <Input
                id="name"
                type="text"
                disabled={isSaving}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                disabled={isSaving}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSaving || !isDirty}
                className="bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>

      {/* Account Info */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base">Informações da Conta</CardTitle>
          <CardDescription className="text-slate-400">
            Detalhes somente para leitura sobre sua conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-slate-50/50 px-4 py-3">
            <span className="text-sm text-slate-400">Tipo de conta</span>
            <span className="text-sm font-medium text-slate-700 capitalize">
              {session?.user?.role === "owner"
                ? "Proprietário"
                : session?.user?.role === "admin"
                ? "Administrador"
                : "Creator"}
            </span>
          </div>
          <div className="rounded-lg bg-slate-50/50 px-4 py-3">
            <p className="text-xs text-slate-400 mb-2">Segurança</p>
            <p className="text-sm text-slate-500">
              Para alterar sua senha, entre em contato com o suporte ou
              solicite um reset ao administrador da plataforma.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
