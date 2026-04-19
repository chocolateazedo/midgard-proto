"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Video,
  File as FileIcon,
  Radio,
  X,
} from "lucide-react";

import { cancelScheduledPublish } from "@/server/actions/content.actions";
import { cancelLiveSchedule } from "@/server/actions/live-schedule.actions";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UpcomingFeedItem } from "@/server/queries/content";

interface UpcomingFeedProps {
  botId: string;
  items: UpcomingFeedItem[];
}

function formatWhen(date: Date): string {
  const now = new Date();
  const target = new Date(date);
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const diffDays = Math.round(
    (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86400000
  );
  const hhmm = target.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Hoje, ${hhmm}`;
  if (diffDays === 1) return `Amanhã, ${hhmm}`;
  if (diffDays > 1 && diffDays < 7) {
    const weekday = target.toLocaleDateString("pt-BR", { weekday: "long" });
    return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${hhmm}`;
  }
  const dm = target.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  return `${dm}, ${hhmm}`;
}

function ContentIcon({
  item,
}: {
  item: Extract<UpcomingFeedItem, { kind: "content" }>;
}) {
  const [failed, setFailed] = useState(false);
  if (item.hasThumbnail && !failed) {
    return (
      <img
        src={`/api/content/${item.id}/preview`}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  const icon =
    item.type === "video" ? (
      <Video className="h-6 w-6 text-blue-400" />
    ) : item.type === "image" ? (
      <ImageIcon className="h-6 w-6 text-primary-600" />
    ) : (
      <FileIcon className="h-6 w-6 text-slate-400" />
    );
  return <div className="flex items-center justify-center h-full">{icon}</div>;
}

export function UpcomingFeed({ botId, items }: UpcomingFeedProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <p className="text-center text-xs text-slate-400 py-4">
        Nada na fila. Toque em + Publicar pra começar.
      </p>
    );
  }

  async function handleCancelContent(id: string) {
    setPendingId(id);
    const res = await cancelScheduledPublish(id);
    setPendingId(null);
    if (!res.success) {
      toast.error(res.error ?? "Erro ao cancelar");
      return;
    }
    toast.success("Cancelado");
    startTransition(() => router.refresh());
  }

  async function handleCancelLive(id: string) {
    setPendingId(id);
    const res = await cancelLiveSchedule(id);
    setPendingId(null);
    if (!res.success) {
      toast.error(res.error ?? "Erro ao cancelar");
      return;
    }
    toast.success("Live cancelada");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        O que vai sair
      </h2>

      <div className="space-y-2">
        {items.map((item) => {
          const busy = pendingId === item.id || isPending;
          return (
            <div
              key={`${item.kind}-${item.id}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                {item.kind === "content" ? (
                  <ContentIcon item={item} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-red-50">
                    <Radio className="h-6 w-6 text-red-500" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {item.kind === "content" ? item.title : `Live: ${item.title}`}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatWhen(item.scheduledAt)}
                  {item.kind === "content" && (
                    <>
                      <span className="mx-1.5 text-slate-300">•</span>
                      <span>
                        {item.deliveryMode === "catalog"
                          ? "Catálogo"
                          : `Avulso ${formatCurrency(item.price)}`}
                      </span>
                    </>
                  )}
                  {item.kind === "live" && item.price > 0 && (
                    <>
                      <span className="mx-1.5 text-slate-300">•</span>
                      <span>{formatCurrency(item.price)}</span>
                    </>
                  )}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  item.kind === "content"
                    ? handleCancelContent(item.id)
                    : handleCancelLive(item.id)
                }
                className="shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
