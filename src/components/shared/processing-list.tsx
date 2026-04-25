"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Video,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchInProgressContent } from "@/server/actions/processing.actions";
import type { ProcessingContent } from "@/server/queries/processing";

interface Props {
  /**
   * Mostra coluna com o nome do creator. Usado no escopo admin e manager;
   * pra creator vendo o próprio, não há razão de mostrar.
   */
  showCreator: boolean;
  /** Texto do header da página. */
  title: string;
  description: string;
}

const POLL_INTERVAL_MS = 8000;

export function ProcessingList({ showCreator, title, description }: Props) {
  const [items, setItems] = React.useState<ProcessingContent[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [polling, setPolling] = React.useState(false);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setPolling(true);
    try {
      const result = await fetchInProgressContent();
      if (result.success && result.data) {
        setItems(result.data);
      } else if (!silent) {
        toast.error(result.error ?? "Erro ao carregar");
      }
    } finally {
      if (!silent) setLoading(false);
      setPolling(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading && items === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
          className="h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${polling ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">
            {(items?.length ?? 0)} em processamento
          </CardTitle>
          <CardDescription className="text-slate-400">
            A lista atualiza automaticamente a cada poucos segundos. Itens
            concluídos saem da tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!items || items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              Nada em processamento no momento.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((c) => (
                <ProcessingRow key={c.id} content={c} showCreator={showCreator} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProcessingRow({
  content,
  showCreator,
}: {
  content: ProcessingContent;
  showCreator: boolean;
}) {
  const Icon = iconForType(content.type);
  return (
    <div className="py-4 space-y-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {content.title}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge
                variant="outline"
                className="border-slate-200 text-slate-500 font-normal h-5 px-1.5 text-xs"
              >
                {content.botName}
              </Badge>
              {showCreator && (
                <Badge
                  variant="outline"
                  className="border-slate-200 text-slate-500 font-normal h-5 px-1.5 text-xs"
                >
                  {content.creatorName}
                </Badge>
              )}
              <span className="text-xs text-slate-400">
                {formatTimeAgo(content.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-600 shrink-0">
          {content.stageLabel} · {content.percent}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-primary-600 transition-all duration-500"
          style={{ width: `${content.percent}%` }}
        />
      </div>
    </div>
  );
}

function iconForType(type: ProcessingContent["type"]) {
  if (type === "image") return ImageIcon;
  if (type === "video") return Video;
  return FileText;
}

function formatTimeAgo(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const seconds = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
