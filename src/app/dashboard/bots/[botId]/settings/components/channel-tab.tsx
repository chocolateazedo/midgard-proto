"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  RadioTower,
  RefreshCw,
  Send,
  Unplug,
  UserPlus,
} from "lucide-react";
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
  addMtprotoToBotChannel,
  confirmChannelLink,
  getChannelStatus,
  getMtprotoChannelStatus,
  postCatalogToChannel,
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
  const [posting, setPosting] = React.useState(false);

  // Estado da conta "Telegram BotFans" (MTProto) no canal deste bot.
  const [mtproto, setMtproto] = React.useState<{
    hasChannel: boolean;
    isMember: boolean | null;
  } | null>(null);
  const [loadingMtproto, setLoadingMtproto] = React.useState(false);
  const [joiningMtproto, setJoiningMtproto] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const res = await getChannelStatus(botId);
    if (res.success && res.data) setStatus(res.data);
    setLoading(false);
  }, [botId]);

  const refreshMtproto = React.useCallback(async () => {
    setLoadingMtproto(true);
    try {
      const res = await getMtprotoChannelStatus(botId);
      if (res.success && res.data) setMtproto(res.data);
    } finally {
      setLoadingMtproto(false);
    }
  }, [botId]);

  React.useEffect(() => {
    refresh();
    // Polling enquanto o canal não estiver vinculado — detecta o
    // momento em que a modelo adiciona o bot como admin.
    const id = setInterval(() => {
      if (!status?.linked) refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [refresh, status?.linked]);

  // Carrega status MTProto sempre que o canal vira "linked".
  React.useEffect(() => {
    if (status?.linked) refreshMtproto();
    else setMtproto(null);
  }, [status?.linked, refreshMtproto]);

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

  async function handlePostCatalog() {
    if (
      !confirm(
        "Postar todo o catálogo (conteúdo publicado em modo catálogo) no canal? Pode gerar várias mensagens."
      )
    ) {
      return;
    }
    setPosting(true);
    try {
      const res = await postCatalogToChannel(botId);
      if (res.success && res.data) {
        const n = res.data.posted;
        if (n === 0) toast.info("Nenhum conteúdo de catálogo publicado pra postar.");
        else toast.success(`Posts enviados no canal: ${n}.`);
      } else {
        toast.error(res.error ?? "Erro ao postar catálogo");
      }
    } finally {
      setPosting(false);
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

  async function handleJoinMtproto() {
    setJoiningMtproto(true);
    try {
      const res = await addMtprotoToBotChannel(botId);
      if (res.success && res.data) {
        toast.success(
          res.data.status === "already"
            ? "Telegram BotFans já era membro"
            : "Telegram BotFans adicionado ao canal"
        );
        await refreshMtproto();
      } else {
        toast.error(res.error ?? "Erro ao adicionar");
      }
    } finally {
      setJoiningMtproto(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }

  // ESTADO 1: nem vinculado nem pending — mostra instruções.
  if (!status?.linked && !status?.pending) {
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
        <CardContent>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
            <p className="font-medium text-slate-900">Como vincular um canal</p>
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
              <li>Volte aqui — assim que detectarmos, aparece o botão pra confirmar.</li>
            </ol>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aguardando detecção automática...
          </div>
        </CardContent>
      </Card>
    );
  }

  // ESTADO 2: pending — bot é admin de um canal, falta confirmar.
  if (status?.pending) {
    return (
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary-600" />
            Canal Telegram
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    );
  }

  // ESTADO 3: linked — agrupado em 4 zonas distintas.
  return (
    <div className="space-y-4">
      {/* ZONA 1: Status do canal */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary-600" />
            Canal Telegram
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* ZONA 2: Telegram BotFans (MTProto) no canal */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">
            Telegram BotFans no canal
          </CardTitle>
          <CardDescription className="text-slate-500">
            Adiciona a conta da plataforma como membro do canal pra backup,
            monitoramento e moderação. Idempotente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50/50 p-3">
            <div
              className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
                mtproto?.isMember === true
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  : mtproto?.isMember === false
                    ? "bg-amber-400"
                    : "bg-slate-300"
              }`}
            />
            <div className="text-sm">
              <p className="text-slate-700">
                {loadingMtproto && !mtproto
                  ? "Verificando..."
                  : mtproto?.isMember === true
                    ? "Conectada — Telegram BotFans é membro deste canal"
                    : mtproto?.isMember === false
                      ? "Não conectada — adicione abaixo"
                      : "Status indisponível (verifique a conexão MTProto em Configurações → Integração)"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refreshMtproto}
              disabled={loadingMtproto}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingMtproto ? "animate-spin" : ""}`} />
              Atualizar status
            </Button>
            {mtproto?.isMember !== true && (
              <Button
                type="button"
                size="sm"
                onClick={handleJoinMtproto}
                disabled={joiningMtproto || mtproto?.isMember === null}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {joiningMtproto ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Adicionar Telegram BotFans
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ZONA 3: Ações operacionais */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">Ações no canal</CardTitle>
          <CardDescription className="text-slate-500">
            Operações pontuais — afetam assinantes e/ou conteúdo postado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
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
            Reenviar link aos assinantes
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={posting}
            onClick={handlePostCatalog}
            className="border-primary-200 text-primary-700 hover:bg-primary-50"
          >
            {posting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Megaphone className="h-4 w-4 mr-2" />
            )}
            Postar catálogo no canal
          </Button>
        </CardContent>
      </Card>

      {/* ZONA 4: Zona de risco */}
      <Card className="bg-white border-red-200/60">
        <CardHeader>
          <CardTitle className="text-base text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Desvincular canal
          </CardTitle>
          <CardDescription className="text-slate-500">
            Postagens em modo catálogo voltam a ser enviadas por DM. Bots
            continuam membros do canal — esta ação só remove o vínculo no
            banco da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
