"use client";

import * as React from "react";
import { CheckCircle2, Loader2, RadioTower, Send, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  confirmChannelLink,
  getChannelStatus,
  resendChannelInvites,
  unlinkChannel,
  type ChannelStatus,
} from "@/server/actions/channel.actions";

type Props = { botId: string };

export function ChannelTab({ botId }: Props) {
  const [status, setStatus] = React.useState<ChannelStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [confirming, setConfirming] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState(false);
  const [resending, setResending] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const res = await getChannelStatus(botId);
    if (res.success && res.data) setStatus(res.data);
    setLoading(false);
  }, [botId]);

  React.useEffect(() => {
    refresh();
    // Polling leve a cada 5s enquanto não estiver vinculado — detecta o momento
    // em que a modelo adiciona o bot como admin no Telegram.
    const id = setInterval(() => {
      if (!status?.linked) refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [refresh, status?.linked]);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const res = await confirmChannelLink(botId);
      if (res.success && res.data) {
        toast.success(`Canal vinculado: ${res.data.channelTitle}`);
        await refresh();
      } else {
        toast.error(res.error ?? "Erro ao vincular canal");
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleResend() {
    if (
      !confirm(
        "Reenviar um novo link de acesso (uso único) para TODOS os assinantes ativos? Pode levar alguns segundos."
      )
    ) {
      return;
    }
    setResending(true);
    try {
      const res = await resendChannelInvites(botId);
      if (res.success && res.data) {
        const n = res.data.count;
        if (n === 0) toast.info("Nenhum assinante ativo pra reenviar.");
        else toast.success(`Reenvio em andamento pra ${n} assinante${n === 1 ? "" : "s"}.`);
      } else {
        toast.error(res.error ?? "Erro ao reenviar links");
      }
    } finally {
      setResending(false);
    }
  }

  async function handleUnlink() {
    if (!confirm("Desvincular o canal? Postagens catalog voltarão a ser enviadas por DM.")) {
      return;
    }
    setUnlinking(true);
    try {
      const res = await unlinkChannel(botId);
      if (res.success) {
        toast.success("Canal desvinculado");
        await refresh();
      } else {
        toast.error(res.error ?? "Erro ao desvincular");
      }
    } finally {
      setUnlinking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <Card className="bg-white border-slate-200/60">
      <CardHeader>
        <CardTitle className="text-slate-900 flex items-center gap-2">
          <RadioTower className="h-4 w-4 text-primary-600" />
          Canal Telegram
        </CardTitle>
        <CardDescription className="text-slate-500">
          Vincule um canal Telegram ao bot. Quando vinculado, assinantes recebem
          link de convite ao pagar e são removidos automaticamente ao expirar.
          Conteúdo do catálogo passa a ser postado no canal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.linked ? (
          <>
            <div className="flex items-start gap-3 rounded-md border border-emerald-600/30 bg-emerald-50 p-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-800">
                <div className="font-medium">Canal vinculado</div>
                <div className="text-emerald-700 mt-0.5">
                  <strong>{status.channelTitle}</strong>
                  {status.channelUsername ? ` · @${status.channelUsername}` : ""}
                </div>
                <div className="text-xs text-emerald-700/80 mt-1">
                  Vinculado em{" "}
                  {status.channelLinkedAt
                    ? new Date(status.channelLinkedAt).toLocaleString("pt-BR")
                    : "—"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={resending}
                onClick={handleResend}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {resending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Reenviar link aos assinantes ativos
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={unlinking}
                onClick={handleUnlink}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                {unlinking ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Unplug className="h-4 w-4 mr-2" />
                )}
                Desvincular canal
              </Button>
            </div>
          </>
        ) : status?.pending ? (
          <>
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="font-medium">Canal detectado</div>
              <div className="mt-1">
                <strong>{status.pending.title}</strong>
                {status.pending.username ? ` · @${status.pending.username}` : ""}
              </div>
              <div className="text-xs text-amber-700/80 mt-1">
                O bot foi adicionado como administrador. Confirme para vincular.
              </div>
            </div>
            <Button
              type="button"
              disabled={confirming}
              onClick={handleConfirm}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Vinculando...
                </>
              ) : (
                "Vincular canal"
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
              <p className="font-medium text-slate-900">
                Como vincular um canal
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>
                  No Telegram, crie um canal (público ou privado) e abra as
                  configurações dele.
                </li>
                <li>
                  Em <em>Administradores</em>, adicione{" "}
                  <strong>o bot deste dashboard</strong> (mesmo username do bot).
                </li>
                <li>
                  Conceda as permissões{" "}
                  <strong>Adicionar Membros</strong>,{" "}
                  <strong>Remover Membros</strong> e{" "}
                  <strong>Postar Mensagens</strong>.
                </li>
                <li>
                  Volte aqui — assim que detectarmos, aparece o botão pra
                  confirmar.
                </li>
              </ol>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aguardando detecção automática...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
