"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Database,
  HardDrive,
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Cpu,
  Users,
  Bot,
  Loader2,
  Radio,
} from "lucide-react";

type ServiceStatus = {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
};

type DiagnosticsData = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    storage: ServiceStatus;
    streaming: ServiceStatus;
  };
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function StatusBadge({ status }: { status: "healthy" | "degraded" | "unhealthy" }) {
  const config = {
    healthy: { label: "Healthy", bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-400" },
    degraded: { label: "Degraded", bg: "bg-amber-500/15", text: "text-amber-400", dot: "bg-amber-400" },
    unhealthy: { label: "Unhealthy", bg: "bg-red-500/15", text: "text-red-400", dot: "bg-red-400" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.bg} ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot} animate-pulse`} />
      {config.label}
    </span>
  );
}

function ServiceCard({
  name,
  icon: Icon,
  service,
}: {
  name: string;
  icon: typeof Database;
  service: ServiceStatus;
}) {
  const isOk = service.status === "ok";

  return (
    <div className={`rounded-2xl border p-6 transition-all ${
      isOk
        ? "border-slate-700/50 bg-slate-800/50"
        : "border-red-500/30 bg-red-500/5"
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isOk ? "bg-slate-700/50" : "bg-red-500/10"
          }`}>
            <Icon className={`h-5 w-5 ${isOk ? "text-slate-300" : "text-red-400"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{name}</h3>
            <p className={`text-xs ${isOk ? "text-slate-400" : "text-red-400"}`}>
              {isOk ? "Connected" : "Connection failed"}
            </p>
          </div>
        </div>
        {isOk ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" />
        )}
      </div>

      {/* Latency */}
      {service.latencyMs !== undefined && (
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm text-slate-400">Latency</span>
          <span className={`ml-auto text-sm font-mono font-medium ${
            service.latencyMs < 100
              ? "text-emerald-400"
              : service.latencyMs < 500
                ? "text-amber-400"
                : "text-red-400"
          }`}>
            {service.latencyMs}ms
          </span>
        </div>
      )}

      {/* Latency bar */}
      {service.latencyMs !== undefined && (
        <div className="h-1.5 w-full rounded-full bg-slate-700/50 mb-4 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              service.latencyMs < 100
                ? "bg-emerald-400"
                : service.latencyMs < 500
                  ? "bg-amber-400"
                  : "bg-red-400"
            }`}
            style={{ width: `${Math.min(100, (service.latencyMs / 1000) * 100)}%` }}
          />
        </div>
      )}

      {/* Details */}
      {service.details && Object.keys(service.details).length > 0 && (
        <div className="space-y-2 border-t border-slate-700/50 pt-3">
          {Object.entries(service.details).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-slate-500 capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <span className="text-xs font-mono text-slate-300">
                {typeof value === "object" ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {service.error && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-xs font-mono text-red-400 break-all">{service.error}</p>
        </div>
      )}
    </div>
  );
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDiagnostics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/diagnostics");
      if (res.status === 401) {
        setError("Unauthorized — configure DIAGNOSTICS_TOKEN or remove it to allow public access.");
        return;
      }
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch {
      setError("Failed to reach diagnostics endpoint.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchDiagnostics, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchDiagnostics]);

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
    streaming: "MediaMTX Streaming",
  } as const;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
              <Activity className="h-5 w-5 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">System Diagnostics</h1>
          </div>
          <p className="text-sm text-slate-400 ml-[52px]">
            Real-time health monitoring for BotFlow services
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
            <XCircle className="mx-auto h-8 w-8 text-red-400 mb-3" />
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchDiagnostics}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && !data && !error && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400 mb-4" />
            <p className="text-sm text-slate-400">Checking services...</p>
          </div>
        )}

        {data && (
          <>
            {/* Overall status + controls */}
            <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-6">
              <div className="flex items-center gap-4">
                <StatusBadge status={data.status} />
                <div className="text-sm text-slate-400">
                  {data.status === "healthy"
                    ? "All systems operational"
                    : data.status === "degraded"
                      ? "Some services have issues"
                      : "Critical — all services down"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAutoRefresh((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    autoRefresh
                      ? "bg-violet-500/15 text-violet-400"
                      : "bg-slate-700/50 text-slate-400"
                  }`}
                >
                  Auto-refresh {autoRefresh ? "ON" : "OFF"}
                </button>
                <button
                  onClick={fetchDiagnostics}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Info cards */}
            <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                <p className="text-xs text-slate-500 mb-1">Environment</p>
                <p className="text-sm font-medium text-white capitalize">{data.environment}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                <p className="text-xs text-slate-500 mb-1">Version</p>
                <p className="text-sm font-medium text-white font-mono">{data.version}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                <p className="text-xs text-slate-500 mb-1">Uptime</p>
                <p className="text-sm font-medium text-white font-mono">{formatUptime(data.uptime)}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                <p className="text-xs text-slate-500 mb-1">Last Check</p>
                <p className="text-sm font-medium text-white font-mono">
                  {lastRefresh ? lastRefresh.toLocaleTimeString("pt-BR") : "—"}
                </p>
              </div>
            </div>

            {/* Service cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(data.services) as Array<keyof typeof data.services>).map(
                (key) => (
                  <ServiceCard
                    key={key}
                    name={serviceLabels[key]}
                    icon={serviceIcons[key]}
                    service={data.services[key]}
                  />
                )
              )}
            </div>

            {/* Quick stats from postgres details */}
            {data.services.postgres.status === "ok" && data.services.postgres.details && (
              <div className="mt-8 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-6">
                <h2 className="text-sm font-semibold text-slate-300 mb-4">Platform Stats</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-xs text-slate-500">Users</p>
                      <p className="text-lg font-bold text-white">
                        {String(data.services.postgres.details.users ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Bot className="h-4 w-4 text-violet-400" />
                    <div>
                      <p className="text-xs text-slate-500">Bots</p>
                      <p className="text-lg font-bold text-white">
                        {String(data.services.postgres.details.bots ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-xs text-slate-500">DB Server Time</p>
                      <p className="text-xs font-mono text-slate-300">
                        {data.services.postgres.details.serverTime
                          ? new Date(String(data.services.postgres.details.serverTime)).toLocaleTimeString("pt-BR")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Timestamp */}
            <p className="mt-8 text-center text-xs text-slate-600">
              Response timestamp: {new Date(data.timestamp).toLocaleString("pt-BR")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
