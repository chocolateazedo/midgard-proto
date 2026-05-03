"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Archive,
  RefreshCw,
  Image as ImageIcon,
  Video,
  Music,
  Mic,
  Film,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  startChannelBackup,
  getBackupStatus,
  listBackupItems,
  startChannelRestore,
  getRestoreStatus,
  type BackupRunSummary,
  type BackupItemSummary,
  type RestoreRunSummary,
} from "@/server/actions/backup.actions";

const PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 2000;

function formatBytes(bytesStr: string): string {
  const n = Number(bytesStr);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MediaIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "photo":
      return <ImageIcon className={`${cls} text-blue-600`} />;
    case "video":
      return <Video className={`${cls} text-purple-600`} />;
    case "audio":
      return <Music className={`${cls} text-amber-600`} />;
    case "voice":
      return <Mic className={`${cls} text-rose-600`} />;
    case "animation":
      return <Film className={`${cls} text-fuchsia-600`} />;
    default:
      return <FileText className={`${cls} text-slate-500`} />;
  }
}

function StatusBadge({ status }: { status: BackupRunSummary["status"] }) {
  const map = {
    pending: {
      icon: Clock,
      label: "Aguardando",
      cls: "bg-slate-100 text-slate-600 border-slate-300",
    },
    running: {
      icon: Loader2,
      label: "Em execução",
      cls: "bg-blue-50 text-blue-700 border-blue-300",
    },
    succeeded: {
      icon: CheckCircle2,
      label: "Concluído",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-300",
    },
    failed: {
      icon: XCircle,
      label: "Falhou",
      cls: "bg-red-50 text-red-700 border-red-300",
    },
    cancelled: {
      icon: XCircle,
      label: "Cancelado",
      cls: "bg-slate-100 text-slate-600 border-slate-300",
    },
  } as const;
  const { icon: Icon, label, cls } = map[status];
  return (
    <Badge variant="outline" className={`gap-1 ${cls}`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}

interface BackupClientProps {
  botId: string;
  hasChannel: boolean;
}

export function BackupClient({ botId, hasChannel }: BackupClientProps) {
  const [current, setCurrent] = useState<BackupRunSummary | null>(null);
  const [lastFinished, setLastFinished] = useState<BackupRunSummary | null>(
    null,
  );
  const [totalItems, setTotalItems] = useState(0);
  const [items, setItems] = useState<BackupItemSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isStarting, startTransition] = useTransition();
  const [restoreCurrent, setRestoreCurrent] = useState<RestoreRunSummary | null>(
    null,
  );
  const [restoreLast, setRestoreLast] = useState<RestoreRunSummary | null>(null);
  const [isRestoring, startRestoreTransition] = useTransition();

  const refreshStatus = useCallback(async () => {
    const [bk, rs] = await Promise.all([
      getBackupStatus(botId),
      getRestoreStatus(botId),
    ]);
    if (bk.success && bk.data) {
      setCurrent(bk.data.current);
      setLastFinished(bk.data.lastFinished);
      setTotalItems(bk.data.totalItems);
    }
    if (rs.success && rs.data) {
      setRestoreCurrent(rs.data.current);
      setRestoreLast(rs.data.lastFinished);
    }
  }, [botId]);

  const refreshItems = useCallback(
    async (pageNum: number) => {
      setLoadingItems(true);
      const res = await listBackupItems(botId, pageNum, PAGE_SIZE);
      if (res.success && res.data) {
        setItems(res.data.items);
        setTotalRows(res.data.total);
      }
      setLoadingItems(false);
    },
    [botId],
  );

  useEffect(() => {
    refreshStatus();
    refreshItems(1);
  }, [refreshStatus, refreshItems]);

  // Polling enquanto há run ativa (backup ou restore)
  useEffect(() => {
    if (!current && !restoreCurrent) return;
    const id = setInterval(() => {
      refreshStatus();
      refreshItems(page);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [current, restoreCurrent, page, refreshStatus, refreshItems]);

  const handleStart = () => {
    startTransition(async () => {
      const res = await startChannelBackup(botId);
      if (res.success) {
        toast.success("Backup iniciado");
        await refreshStatus();
      } else {
        toast.error(res.error ?? "Falha ao iniciar backup");
      }
    });
  };

  const handleRestore = () => {
    startRestoreTransition(async () => {
      const res = await startChannelRestore(botId);
      if (res.success) {
        toast.success(
          `Restore iniciado — ${res.data?.itemsToSend} item(s) na fila`,
        );
        await refreshStatus();
      } else {
        toast.error(res.error ?? "Falha ao iniciar restore");
      }
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const isRunning = !!current;
  const isRestoreRunning = !!restoreCurrent;

  return (
    <div className="space-y-6">
      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <Archive className="h-5 w-5 text-emerald-600" />
                Backup do Canal
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Copia toda a mídia do canal vinculado ao bot pro storage da
                plataforma. Pula o que já foi copiado.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleStart}
                disabled={!hasChannel || isRunning || isStarting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isStarting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                {isRunning ? "Em execução..." : "Fazer backup"}
              </Button>
              <Button
                onClick={handleRestore}
                disabled={
                  !hasChannel ||
                  totalItems === 0 ||
                  isRestoreRunning ||
                  isRestoring
                }
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                {isRestoring ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isRestoreRunning ? "Enviando..." : "Restaurar"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasChannel && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Esse bot ainda não tem canal vinculado. Vincule um canal nas
              configurações antes de fazer backup.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total no acervo" value={String(totalItems)} />
            <Stat
              label="Mensagens varridas"
              value={String(
                current?.messagesScanned ??
                  lastFinished?.messagesScanned ??
                  0,
              )}
            />
            <Stat
              label="Adicionados"
              value={String(
                current?.itemsAdded ?? lastFinished?.itemsAdded ?? 0,
              )}
            />
            <Stat
              label="Pulados"
              value={String(
                current?.itemsSkipped ?? lastFinished?.itemsSkipped ?? 0,
              )}
            />
          </div>

          {current && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={current.status} />
                <span className="text-xs text-slate-600">
                  Iniciado em {formatDateTime(current.startedAt)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  refreshStatus();
                  refreshItems(page);
                }}
                className="text-blue-700 hover:bg-blue-100"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}

          {current?.currentMessageId !== null &&
            current?.currentMessageId !== undefined && (
              <CurrentItemProgress run={current} />
            )}

          {!current && lastFinished && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={lastFinished.status} />
                <span className="text-xs text-slate-600">
                  {lastFinished.finishedAt
                    ? `Finalizado em ${formatDateTime(lastFinished.finishedAt)}`
                    : `Iniciado em ${formatDateTime(lastFinished.startedAt)}`}
                </span>
              </div>
              {lastFinished.errorMessage && (
                <span
                  className="text-xs text-red-700 truncate max-w-md"
                  title={lastFinished.errorMessage}
                >
                  {lastFinished.errorMessage}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(restoreCurrent || restoreLast) && (
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Restore — envio pro canal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {restoreCurrent ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Total" value={String(restoreCurrent.itemsTotal)} />
                  <Stat label="Enviados" value={String(restoreCurrent.itemsSent)} />
                  <Stat label="Falharam" value={String(restoreCurrent.itemsFailed)} />
                  <Stat
                    label="Restantes"
                    value={String(
                      Math.max(
                        0,
                        restoreCurrent.itemsTotal -
                          restoreCurrent.itemsSent -
                          restoreCurrent.itemsFailed,
                      ),
                    )}
                  />
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={restoreCurrent.status} />
                    <span className="text-xs text-slate-600">
                      Iniciado em {formatDateTime(restoreCurrent.startedAt)}
                    </span>
                  </div>
                </div>
                {restoreCurrent.itemsTotal > 0 && (
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.floor(
                            ((restoreCurrent.itemsSent +
                              restoreCurrent.itemsFailed) /
                              restoreCurrent.itemsTotal) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </>
            ) : restoreLast ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={restoreLast.status} />
                  <span className="text-xs text-slate-600">
                    {restoreLast.finishedAt
                      ? `Finalizado em ${formatDateTime(restoreLast.finishedAt)}`
                      : `Iniciado em ${formatDateTime(restoreLast.startedAt)}`}
                  </span>
                  <span className="text-xs text-slate-600">
                    — {restoreLast.itemsSent} enviado(s),{" "}
                    {restoreLast.itemsFailed} falhou
                  </span>
                </div>
                {restoreLast.errorMessage && (
                  <span
                    className="text-xs text-red-700 truncate max-w-md"
                    title={restoreLast.errorMessage}
                  >
                    {restoreLast.errorMessage}
                  </span>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Itens copiados ({totalRows})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              {loadingItems
                ? "Carregando..."
                : "Nenhum item ainda. Clique em Fazer backup pra começar."}
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Tamanho</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Legenda
                      </TableHead>
                      <TableHead>Mensagem</TableHead>
                      <TableHead>Copiado em</TableHead>
                      <TableHead>Enviado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <MediaIcon type={item.mediaType} />
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {item.mediaType}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatBytes(item.sizeBytes)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-slate-500 max-w-xs truncate">
                          {item.caption ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          #{item.telegramMessageId}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDateTime(item.syncedAt)}
                        </TableCell>
                        <TableCell>
                          <RestoreCellStatus item={item} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loadingItems}
                      onClick={() => {
                        const next = page - 1;
                        setPage(next);
                        refreshItems(next);
                      }}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || loadingItems}
                      onClick={() => {
                        const next = page + 1;
                        setPage(next);
                        refreshItems(next);
                      }}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RestoreCellStatus({ item }: { item: BackupItemSummary }) {
  if (item.restoreSentAt) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span className="text-xs text-slate-700">
          {formatDateTime(item.restoreSentAt)}
        </span>
      </div>
    );
  }
  if (item.restoreFailedAt) {
    return (
      <div
        className="flex items-center gap-1.5"
        title={item.restoreError ?? undefined}
      >
        <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
        <span className="text-xs text-red-700 truncate max-w-[160px]">
          {item.restoreError ?? "Falhou"}
        </span>
      </div>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}

function CurrentItemProgress({ run }: { run: BackupRunSummary }) {
  const downloaded = run.currentBytesDownloaded
    ? Number(run.currentBytesDownloaded)
    : 0;
  const total = run.currentBytesTotal ? Number(run.currentBytesTotal) : null;
  const percent =
    total && total > 0
      ? Math.min(100, Math.floor((downloaded / total) * 100))
      : null;
  const startedAt = run.currentItemStartedAt
    ? typeof run.currentItemStartedAt === "string"
      ? new Date(run.currentItemStartedAt)
      : run.currentItemStartedAt
    : null;
  const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : 0;
  const speedBps = elapsedMs > 0 ? (downloaded / elapsedMs) * 1000 : 0;

  return (
    <div className="rounded-lg bg-white border border-blue-300 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MediaIcon type={run.currentMediaType ?? "document"} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              Baixando mensagem #{run.currentMessageId}
            </p>
            <p className="text-xs text-slate-500 capitalize">
              {run.currentMediaType ?? "—"}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono text-slate-900">
            {formatBytes(String(downloaded))}
            {total !== null && (
              <>
                {" "}
                / <span className="text-slate-500">{formatBytes(String(total))}</span>
              </>
            )}
          </p>
          {speedBps > 0 && (
            <p className="text-xs text-slate-500 font-mono">
              {formatBytes(String(Math.round(speedBps)))}/s
            </p>
          )}
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        {percent !== null ? (
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full bg-blue-300/40 animate-pulse" />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>
          {percent !== null ? `${percent}%` : "Tamanho desconhecido"}
        </span>
        {startedAt && (
          <span>
            Decorrido {Math.floor(elapsedMs / 1000)}s
          </span>
        )}
      </div>
    </div>
  );
}
