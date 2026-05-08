"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  XCircle,
  Send,
  Pencil,
  ExternalLink,
  MousePointerClick,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCampaign,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
  getBroadcastMediaPreviewUrl,
  type BroadcastCampaignDetail,
  type BroadcastStatus,
} from "@/server/actions/broadcast.actions";
import { formatDateTime } from "@/lib/utils";

const STATUS_LABELS: Record<BroadcastStatus, { text: string; cls: string }> = {
  draft: { text: "Rascunho", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  scheduled: { text: "Agendada", cls: "bg-amber-50 text-amber-700 border-amber-300" },
  running: { text: "Em envio", cls: "bg-blue-50 text-blue-700 border-blue-300" },
  paused: { text: "Pausada", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  succeeded: { text: "Concluída", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  failed: { text: "Falhou", cls: "bg-red-50 text-red-700 border-red-300" },
  cancelled: { text: "Cancelada", cls: "bg-slate-100 text-slate-500 border-slate-300" },
};

const POLL_MS = 3000;

export function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [data, setData] = useState<BroadcastCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, startActing] = useTransition();
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await getCampaign(campaignId);
    if (r.success && r.data) setData(r.data);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Poll while running ou paused
  useEffect(() => {
    if (!data) return;
    if (data.status !== "running") return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [data, reload]);

  // Carrega presigned URL da mídia pra render do preview
  useEffect(() => {
    if (!data?.content.mediaKey) {
      setMediaPreviewUrl(null);
      return;
    }
    getBroadcastMediaPreviewUrl(data.content.mediaKey).then((r) => {
      if (r.success && r.data) setMediaPreviewUrl(r.data.url);
    });
  }, [data?.content.mediaKey]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const meta = STATUS_LABELS[data.status];
  const totalProcessed =
    data.itemsSent + data.itemsFailed + data.itemsBlocked + data.itemsOptedOut + data.itemsSkipped;
  const pct =
    data.totalRecipients > 0
      ? Math.min(100, Math.floor((totalProcessed / data.totalRecipients) * 100))
      : 0;

  const isEditable = data.status === "draft" || data.status === "scheduled";
  const canStart =
    data.status === "draft" || data.status === "scheduled" || data.status === "paused";
  const canPause = data.status === "running";
  const canCancel = data.status === "running" || data.status === "paused" || data.status === "scheduled";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="text-slate-500">
          <Link href="/admin/marketing">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 truncate">{data.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className={`text-xs ${meta.cls}`}>
              {meta.text}
            </Badge>
            {data.scheduledFor && (
              <span className="text-xs text-slate-500">
                Agendada pra {formatDateTime(new Date(data.scheduledFor))}
              </span>
            )}
            {data.startedAt && (
              <span className="text-xs text-slate-500">
                · iniciada {formatDateTime(new Date(data.startedAt))}
              </span>
            )}
            {data.finishedAt && (
              <span className="text-xs text-slate-500">
                · finalizada {formatDateTime(new Date(data.finishedAt))}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {isEditable && (
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/marketing/${campaignId}/edit`)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Editar
            </Button>
          )}
          {canStart && (
            <Button
              className="bg-primary-600 hover:bg-primary-700 text-white"
              disabled={acting}
              onClick={() =>
                startActing(async () => {
                  const r = await startCampaign(campaignId);
                  if (r.success) {
                    toast.success("Iniciada");
                    reload();
                  } else toast.error(r.error ?? "Erro");
                })
              }
            >
              {acting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
              {data.status === "paused" ? "Retomar" : "Iniciar"}
            </Button>
          )}
          {canPause && (
            <Button
              variant="outline"
              disabled={acting}
              onClick={() =>
                startActing(async () => {
                  const r = await pauseCampaign(campaignId);
                  if (r.success) {
                    toast.success("Pausada");
                    reload();
                  } else toast.error(r.error ?? "Erro");
                })
              }
            >
              <Pause className="h-4 w-4 mr-1" />
              Pausar
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              disabled={acting}
              onClick={() =>
                startActing(async () => {
                  if (!confirm("Cancelar campanha? Não pode desfazer.")) return;
                  const r = await cancelCampaign(campaignId);
                  if (r.success) {
                    toast.success("Cancelada");
                    reload();
                  } else toast.error(r.error ?? "Erro");
                })
              }
            >
              <XCircle className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Progresso */}
      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-600" />
            Progresso de envio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <Stat label="Total" value={data.totalRecipients} />
            <Stat label="Enviados" value={data.itemsSent} cls="text-emerald-700" />
            <Stat label="Falhas" value={data.itemsFailed} cls="text-red-700" />
            <Stat label="Bloqueios" value={data.itemsBlocked} cls="text-orange-700" />
            <Stat label="Opt-out" value={data.itemsOptedOut} cls="text-slate-500" />
          </div>
          {data.totalRecipients > 0 && (
            <>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 text-right">{pct}%</p>
            </>
          )}
          {data.errorMessage && (
            <p className="text-xs text-red-700">{data.errorMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* Cliques */}
      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-emerald-600" />
            Cliques ({data.totalClicks})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data.content.buttons || data.content.buttons.length === 0 ? (
            <p className="text-sm text-slate-500">Sem botões nesta campanha.</p>
          ) : (
            <div className="space-y-2">
              {data.content.buttons.map((b, idx) => {
                const c = data.clicksByButton.find((x) => x.buttonIndex === idx);
                const count = c?.count ?? 0;
                const ctr =
                  data.itemsSent > 0
                    ? ((count / data.itemsSent) * 100).toFixed(1)
                    : "0.0";
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-emerald-700">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{b.text}</p>
                      <a
                        href={b.action.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-slate-700 truncate inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {b.action.url}
                      </a>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-slate-900">{count}</p>
                      <p className="text-xs text-slate-500">{ctr}% CTR</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conteúdo (preview) */}
      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Preview do conteúdo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.content.mediaKey && (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 max-w-md">
              {!mediaPreviewUrl ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : data.content.mediaType === "video" ? (
                <video
                  src={mediaPreviewUrl}
                  controls
                  playsInline
                  className="w-full h-auto"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreviewUrl}
                  alt="preview"
                  className="w-full h-auto object-contain"
                />
              )}
            </div>
          )}
          {data.content.text && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{data.content.text}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${cls ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
