"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, User, KeyRound, AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { updateProfile, changePassword, getUserDocumentInfo } from "@/server/actions/auth.actions";
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
import { AvatarUpload, DocumentUpload } from "@/components/shared/user-documents";

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
});

type ProfileInput = z.infer<typeof profileSchema>;

export default function DashboardSettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [docInfo, setDocInfo] = useState<{
    avatarKey: string | null;
    docType: string | null;
    docFrontKey: string | null;
    docBackKey: string | null;
    docSelfieKey: string | null;
    docStatus: string;
    docRejectReason: string | null;
  } | null>(null);

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
      getUserDocumentInfo().then((result) => {
        if (result.success && result.data) {
          setDocInfo(result.data);
        }
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

      {/* Banners de status de documentos */}
      {docInfo?.docStatus === "rejected" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Documentos reprovados</p>
            <p className="text-sm text-red-600 mt-0.5">
              {docInfo.docRejectReason ?? "Seus documentos foram recusados. Por favor, reenvie abaixo."}
            </p>
          </div>
        </div>
      )}

      {docInfo?.docStatus === "pending" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Documentos em análise</p>
            <p className="text-sm text-amber-600 mt-0.5">
              Seus documentos foram enviados e estão aguardando aprovação do administrador.
            </p>
          </div>
        </div>
      )}

      {docInfo?.docStatus === "none" && !session?.user?.isActive && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Envie seus documentos para ativar sua conta</p>
            <p className="text-sm text-blue-600 mt-0.5">
              Para começar a usar a plataforma, envie seus documentos de identificação abaixo.
            </p>
          </div>
        </div>
      )}

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

      {/* Password Change */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">Alterar Senha</CardTitle>
          </div>
          <CardDescription className="text-slate-400">
            Defina uma nova senha para sua conta
          </CardDescription>
        </CardHeader>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (newPassword !== confirmNewPassword) {
              toast.error("As senhas não conferem");
              return;
            }
            setIsChangingPassword(true);
            try {
              const result = await changePassword({
                currentPassword,
                newPassword,
              });
              if (!result.success) {
                toast.error(result.error ?? "Erro ao alterar senha");
                return;
              }
              toast.success("Senha alterada com sucesso!");
              setCurrentPassword("");
              setNewPassword("");
              setConfirmNewPassword("");
            } catch {
              toast.error("Ocorreu um erro. Tente novamente.");
            } finally {
              setIsChangingPassword(false);
            }
          }}
        >
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="text-slate-700">
                Senha atual
              </Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={isChangingPassword}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-slate-700">
                Nova senha
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Minimo 6 caracteres"
                disabled={isChangingPassword}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword" className="text-slate-700">
                Confirmar nova senha
              </Label>
              <Input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                minLength={6}
                disabled={isChangingPassword}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                className="bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
              >
                {isChangingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  "Alterar Senha"
                )}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>

      {/* Avatar */}
      <AvatarUpload currentAvatarKey={docInfo?.avatarKey ?? null} />

      {/* Documentos */}
      <DocumentUpload
        currentDocType={docInfo?.docType ?? null}
        currentDocFrontKey={docInfo?.docFrontKey ?? null}
        currentDocBackKey={docInfo?.docBackKey ?? null}
        currentDocSelfieKey={docInfo?.docSelfieKey ?? null}
      />

      {/* Account Info */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base">Informações da Conta</CardTitle>
          <CardDescription className="text-slate-400">
            Detalhes somente para leitura sobre sua conta
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
