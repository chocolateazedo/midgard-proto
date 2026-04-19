"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Radio,
  Workflow,
  XCircle,
  Calendar,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ServiceStatus = {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
};

type QueueStat = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused?: number;
  lastFailure?: {
    id: string;
    name: string;
    reason: string;
    failedAt: string | null;
  } | null;
  error?: string;
};

type DiagnosticsData = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    storage: ServiceStatus;
    streaming: ServiceStatus;
  };
  queues: QueueStat[];
  schedules: {
    content: { pending: number; overdue: number };
    live: { scheduled: number; started: number; missedLast24h: number };
  };
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function latencyTone(ms?: number): string {
  if (ms === undefined) return "text-slate-400";
  if (ms < 100) return "text-emerald-600";
  if (ms < 500) return "text-amber-600";
  return "text-red-600";
}

function StatusPill({ s }: { s: "healthy" | "degraded" | "unhealthy" }) {
  const cfg = {
    healthy: {
      label: "Saudável",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      dot: "bg-emerald-500",
    },
    degraded: {
      label: "Degradado",
      bg: "bg-amber-50",
      text: "text-amber-700",
      dot: "bg-amber-500",
    },
    unhealthy: {
      label: "Crítico",
      bg: "bg-red-50",
      text: "text-red-700",
      dot: "bg-red-500",
    },
  }[s];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${cfg.dot} animate-pulse`} />
      {cfg.label}
    </span>
  );
}

function ServiceCard({
  name,
  Icon,
  svc,
}: {
  name: string;
  Icon: typeof Database;
  svc: ServiceStatus;
}) {
  const ok = svc.status === "ok";
  return (
    <Card
      className={`bg-white rounded-xl ${
        ok ? "border-slate-200/60" : "border-red-300"
      }`}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                ok ? "bg-slate-50" : "bg-red-50"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${ok ? "text-slate-600" : "text-red-600"}`}
              />
            </div>
            <p className="text-sm font-medium text-slate-900">{name}</p>
          </div>
          {ok ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
        </div>

        {svc.latencyMs !== undefined && (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3 text-slate-400" />
            <span className="text-slate-500">Latência</span>
            <span className={`ml-auto font-mono font-medium ${latencyTone(svc.latencyMs)}`}>
              {svc.latencyMs} ms
            </span>
          </div>
        )}

        {svc.details &&
          Object.entries(svc.details).map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between text-xs text-slate-500"
            >
              <span className="capitalize">
                {k.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <span className="font-mono text-slate-700 truncate ml-2 max-w-[60%] text-right">
                {typeof v === "object"
                  ? JSON.stringify(v)
                  : String(v)}
              </span>
            </div>
          ))}

        {svc.error && (
          <p className="text-xs font-mono text-red-600 bg-red-50 rounded px-2 py-1 break-all">
            {svc.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QueueRow({ q }: { q: QueueStat }) {
  const hasIssue = q.failed > 0 || !!q.error;
  const hasBacklog = q.waiting > 50;
  return (
    <div
      className={`rounded-xl border bg-white p-3 ${
        hasIssue ? "border-red-300" : hasBacklog ? "border-amber-300" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex items-center gap-2">
          <Workflow className="h-4 w-4 text-slate-400 shrink-0" />
          <p className="text-sm font-medium text-slate-900 truncate font-mono">
            {q.name}
          </p>
        </div>
        {hasIssue && (
          <Badge className="bg-red-100 text-red-700 border-red-300 shrink-0">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {q.failed > 0 ? `${q.failed} falha${q.failed > 1 ? "s" : ""}` : "erro"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2 text-center">
        <QueueStat label="waiting" value={q.waiting} tone={q.waiting > 50 ? "amber" : "default"} />
        <QueueStat label="active" value={q.active} />
        <QueueStat label="delayed" value={q.delayed} />
        <QueueStat label="done" value={q.completed} tone="emerald" />
        <QueueStat label="failed" value={q.failed} tone={q.failed > 0 ? "red" : "default"} />
      </div>

      {q.error && (
        <p className="mt-2 text-xs font-mono text-red-600 bg-red-50 rounded px-2 py-1">
          {q.error}
        </p>
      )}

      {q.lastFailure && (
        <details className="mt-2 text-xs group">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            Última falha: {q.lastFailure.name} ({q.lastFailure.failedAt
              ? new Date(q.lastFailure.failedAt).toLocaleString("pt-BR")
              : "—"})
          </summary>
          <pre className="mt-1 p-2 bg-slate-50 rounded text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-all">
            {q.lastFailure.reason}
          </pre>
        </details>
      )}
    </div>
  );
}

function QueueStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "amber" | "red";
}) {
  const tones = {
    default: "text-slate-700",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <div className="rounded-md bg-slate-50/60 p-2">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-sm font-semibold font-mono ${tones[tone]}`}>
        {value}
      </p>
    </div>
  );
}

export default function AdminDiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchNow = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/diagnostics", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const json: DiagnosticsData = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar diagnóstico");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNow();
  }, [fetchNow]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchNow, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchNow]);

  const serviceIcons = {
    postgres: Database,
    redis: Cpu,
    storage: HardDrive,
    streaming: Radio,
  } as const;
  const serviceLabels = {
    postgres: "PostgreSQL",
    redis: "Redis",
    storage: "Object Storage",
    streaming: "MediaMTX",
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary-600" />
            Diagnóstico
          </h1>
          <p className="text-sm text-slate-400">
            Saúde em tempo real dos serviços, filas e agendamentos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`border-slate-200 ${
              autoRefresh
                ? "bg-primary-50 text-primary-700"
                : "bg-white text-slate-600"
            }`}
          >
            Auto {autoRefresh ? "ON" : "OFF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNow}
            disabled={loading}
            className="border-slate-200 bg-white text-slate-700"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && !data && !error && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      )}

      {data && (
        <>
          {/* Status geral + info */}
          <Card className="bg-white border-slate-200/60 rounded-xl">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <StatusPill s={data.status} />
                <div className="text-sm text-slate-600">
                  {data.status === "healthy"
                    ? "Tudo funcionando"
                    : data.status === "degraded"
                      ? "Algumas coisas pedem atenção"
                      : "Problemas críticos"}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span>Env <span className="text-slate-700 font-mono">{data.environment}</span></span>
                <span>Uptime <span className="text-slate-700 font-mono">{formatUptime(data.uptime)}</span></span>
                <span>Checado <span className="text-slate-700 font-mono">{lastRefresh?.toLocaleTimeString("pt-BR") ?? "—"}</span></span>
              </div>
            </CardContent>
          </Card>

          {/* Serviços */}
          <div>
            <h2 className="text-sm font-medium text-slate-700 mb-3">Serviços</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(data.services) as Array<keyof typeof data.services>).map((k) => (
                <ServiceCard
                  key={k}
                  name={serviceLabels[k]}
                  Icon={serviceIcons[k]}
                  svc={data.services[k]}
                />
              ))}
            </div>
          </div>

          {/* Agendamentos */}
          <div>
            <h2 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Agendamentos
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="bg-white border-slate-200/60 rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-900">Conteúdo agendado</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{data.schedules.content.pending}</p>
                      <p className="text-xs text-slate-400">pendentes</p>
                    </div>
                    {data.schedules.content.overdue > 0 && (
                      <div className="text-right">
                        <p className="text-xl font-bold text-red-600">
                          {data.schedules.content.overdue}
                        </p>
                        <p className="text-xs text-red-500">atrasados</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200/60 rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-900">Lives</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xl font-bold text-slate-900">{data.schedules.live.scheduled}</p>
                      <p className="text-xs text-slate-400">agendadas</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-red-600">{data.schedules.live.started}</p>
                      <p className="text-xs text-slate-400">ao vivo</p>
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${data.schedules.live.missedLast24h > 0 ? "text-amber-600" : "text-slate-900"}`}>
                        {data.schedules.live.missedLast24h}
                      </p>
                      <p className="text-xs text-slate-400">perdidas/24h</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Filas */}
          <div>
            <h2 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Workflow className="h-4 w-4" /> Filas (BullMQ)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.queues.map((q) => (
                <QueueRow key={q.name} q={q} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
