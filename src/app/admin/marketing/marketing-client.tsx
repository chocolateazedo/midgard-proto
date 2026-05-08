"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send,
  Plus,
  Loader2,
  Trash2,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  listCampaigns,
  deleteCampaign,
  type BroadcastCampaignSummary,
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

export function MarketingClient() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<BroadcastCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await listCampaigns();
    if (r.success && r.data) setCampaigns(r.data);
    else toast.error(r.error ?? "Erro ao carregar campanhas");
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Send className="h-6 w-6 text-primary-600" />
            Mensagens (Broadcast)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Envio direto pra usuários cadastrados em bots da plataforma.
          </p>
        </div>
        <Button
          onClick={() => router.push("/admin/marketing/new")}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova campanha
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-16 text-center">
            <p className="text-slate-700 font-medium">Nenhuma campanha ainda</p>
            <p className="text-sm text-slate-500 mt-1">
              Crie uma pra mandar mensagem em massa pros usuários.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const meta = STATUS_LABELS[c.status];
            return (
              <Card key={c.id} className="bg-white border-slate-200/60 rounded-xl">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => router.push(`/admin/marketing/${c.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-medium text-slate-900 truncate">
                        {c.title}
                      </p>
                      <Badge variant="outline" className={`text-xs ${meta.cls}`}>
                        {meta.text}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                      <span>{c.totalRecipients} destinatário(s)</span>
                      {c.itemsSent > 0 && <span>· {c.itemsSent} enviados</span>}
                      {c.itemsBlocked > 0 && (
                        <span>· {c.itemsBlocked} bloqueados</span>
                      )}
                      {c.itemsFailed > 0 && (
                        <span>· {c.itemsFailed} falhas</span>
                      )}
                      {c.scheduledFor && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateTime(new Date(c.scheduledFor))}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Criada em {formatDateTime(new Date(c.createdAt))}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {(c.status === "draft" ||
                      c.status === "scheduled" ||
                      c.status === "succeeded" ||
                      c.status === "failed" ||
                      c.status === "cancelled") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/marketing/${c.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga a campanha e todos os logs de envio + cliques. Não pode
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!deleteId) return;
                const r = await deleteCampaign(deleteId);
                if (r.success) {
                  toast.success("Campanha excluída");
                  reload();
                } else toast.error(r.error ?? "Erro");
                setDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
