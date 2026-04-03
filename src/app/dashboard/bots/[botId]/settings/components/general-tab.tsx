"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateBotSchema, type UpdateBotInput } from "@/lib/validations";
import { updateBot, reactivateWebhook, deleteBot } from "@/server/actions/bot.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GeneralTabProps {
  botId: string;
  basePath?: string;
}

export function GeneralTab({ botId, basePath }: GeneralTabProps) {
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [botData, setBotData] = useState<{
    name: string;
    description: string;
    username: string | null;
    isActive: boolean;
    webhookUrl: string | null;
  } | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateBotInput>({
    resolver: zodResolver(updateBotSchema),
  });

  useEffect(() => {
    async function loadBot() {
      try {
        const res = await fetch(`/api/bots/${botId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const bot = data.data;
          setBotData({
            name: bot.name,
            description: bot.description ?? "",
            username: bot.username,
            isActive: bot.isActive,
            webhookUrl: bot.webhookUrl,
          });
          reset({
            name: bot.name,
            description: bot.description ?? "",
          });
        }
      } catch {
        toast.error("Erro ao carregar dados do bot");
      } finally {
        setIsLoadingData(false);
      }
    }
    loadBot();
  }, [botId, reset]);

  async function onSubmit(data: UpdateBotInput) {
    setIsSaving(true);
    try {
      const result = await updateBot(botId, data);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar alterações");
        return;
      }
      toast.success("Configurações salvas!");
      reset(data);
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReactivateWebhook() {
    setIsReactivating(true);
    try {
      const result = await reactivateWebhook(botId);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao reativar webhook");
        return;
      }
      toast.success("Webhook reativado com sucesso!");
      if (botData) {
        setBotData({ ...botData, isActive: true, webhookUrl: result.data?.webhookUrl ?? null });
      }
    } catch {
      toast.error("Erro ao reativar webhook");
    } finally {
      setIsReactivating(false);
    }
  }

  async function handleDeleteBot() {
    setIsDeleting(true);
    try {
      const result = await deleteBot(botId);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao excluir bot");
        return;
      }
      toast.success("Bot excluído com sucesso.");
      router.push(basePath ? `${basePath}` : "/dashboard/bots");
    } catch {
      toast.error("Erro ao excluir bot");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Formulário principal */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Informações Gerais</CardTitle>
          <CardDescription className="text-slate-400">
            Edite o nome e descrição do bot
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700">
                Nome do Bot
              </Label>
              <Input
                id="name"
                disabled={isSaving}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-700">
                Descrição
              </Label>
              <Textarea
                id="description"
                rows={3}
                disabled={isSaving}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 resize-none"
                {...register("description")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegramToken" className="text-slate-700">
                Token do BotFather
              </Label>
              <div className="relative">
                <Input
                  id="telegramToken"
                  type={showToken ? "text" : "password"}
                  placeholder="Deixe em branco para manter o atual"
                  disabled={isSaving}
                  className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 font-mono text-sm pr-10"
                  {...register("telegramToken")}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.telegramToken && (
                <p className="text-xs text-red-600">
                  {errors.telegramToken.message}
                </p>
              )}
              <p className="text-xs text-slate-400">
                Preencha somente se quiser alterar o token atual
              </p>
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

      {/* Conexão do Bot */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Conexão com o Telegram</CardTitle>
          <CardDescription className="text-slate-400">
            Gerencie a conexão do bot com o Telegram
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  botData?.isActive && botData?.webhookUrl
                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                    : "bg-slate-300"
                }`}
              />
              <div>
                <p className="text-sm text-slate-700">Status da conexão</p>
                <p className="text-xs text-slate-400">
                  {botData?.isActive && botData?.webhookUrl
                    ? "Bot conectado e recebendo mensagens"
                    : "Bot desconectado — não está recebendo mensagens"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReactivateWebhook}
              disabled={isReactivating}
              className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              {isReactivating ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Reconectando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Reconectar Bot
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Zona de Perigo */}
      <Card className="border-red-500/20 bg-white rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-red-600">Zona de Perigo</CardTitle>
          <CardDescription className="text-slate-400">
            Ações irreversíveis — proceda com cuidado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Excluir Bot</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Remove o bot e todos os seus conteúdos permanentemente
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="border-red-500/50 bg-transparent text-red-600 hover:bg-red-500/10 hover:text-red-500 hover:border-red-400"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir Bot
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-slate-200/60 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Bot</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Tem certeza que deseja excluir o bot{" "}
              <span className="font-semibold text-slate-700">{botData?.name}</span>?
              Todos os conteúdos, assinantes e histórico de vendas serão removidos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowDeleteDialog(false)}
              className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBot}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Permanentemente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
