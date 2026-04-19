"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";

import { publishContent } from "@/server/actions/content.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type DeliveryMode = "catalog" | "ondemand";
type When = "now" | "later";

function detectContentType(mimeType: string): "image" | "video" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PublishFormProps {
  botId: string;
}

export function PublishForm({ botId }: PublishFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("catalog");
  const [price, setPrice] = useState("");
  const [when, setWhen] = useState<When>("now");

  const defaultLater = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toDatetimeLocal(d);
  }, []);
  const [scheduledAt, setScheduledAt] = useState(defaultLater);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  function pickFile(f: File | null) {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (f && (f.type.startsWith("image/") || f.type.startsWith("video/"))) {
      setFilePreviewUrl(URL.createObjectURL(f));
    } else {
      setFilePreviewUrl(null);
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (!file) {
      toast.error("Escolha um arquivo");
      return;
    }
    if (deliveryMode === "ondemand") {
      const n = parseFloat(price);
      if (!price || isNaN(n) || n <= 0) {
        toast.error("Defina um preço maior que R$ 0,00");
        return;
      }
    }

    const scheduled =
      when === "later" ? new Date(scheduledAt) : null;
    if (scheduled && scheduled.getTime() <= Date.now() + 60_000) {
      toast.error("Escolha um horário pelo menos 1 minuto no futuro");
      return;
    }

    setBusy(true);
    setProgress("Preparando…");
    try {
      const presignedRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          botId,
        }),
      });
      const presignedData = await presignedRes.json();
      if (!presignedData.success) {
        toast.error(presignedData.error ?? "Erro ao preparar upload");
        return;
      }
      const { url, key } = presignedData.data as { url: string; key: string };

      setProgress("Enviando arquivo…");
      const uploadRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) {
        toast.error("Falha no upload");
        return;
      }

      setProgress("Finalizando…");
      const contentType = detectContentType(file.type);
      const titleFromFile = file.name.replace(/\.[^/.]+$/, "");

      const result = await publishContent({
        botId,
        title: titleFromFile,
        description: caption || null,
        type: contentType,
        originalKey: key,
        deliveryMode,
        price: deliveryMode === "ondemand" ? parseFloat(price) : undefined,
        scheduledAt: scheduled,
      });

      if (!result.success) {
        toast.error(result.error ?? "Erro ao publicar");
        return;
      }

      if (scheduled) {
        toast.success(`Pronto! Vai sair em ${scheduled.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.`);
      } else if (deliveryMode === "catalog") {
        const count = result.data?.broadcastCount ?? 0;
        toast.success(
          count > 0
            ? `Enviado pra ${count} assinante${count === 1 ? "" : "s"}.`
            : "Publicado no catálogo."
        );
      } else {
        toast.success("Publicado.");
      }
      router.push(`/dashboard/bots/${botId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao publicar. Tente novamente.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const primaryLabel = when === "later" ? "Agendar" : "Publicar";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Publicar</h1>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-900"
          aria-label="Fechar"
        >
          <Link href={`/dashboard/bots/${botId}`}>
            <X className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      {/* Arquivo */}
      <div
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
          file ? "border-primary-400 bg-primary-50/30" : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
        }`}
        onClick={() => !busy && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf,.zip,.rar"
          className="hidden"
          disabled={busy}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            {filePreviewUrl ? (
              <div className="relative w-full max-h-64 overflow-hidden rounded-lg">
                {file.type.startsWith("video/") ? (
                  <video
                    src={filePreviewUrl}
                    className="h-full w-full object-cover max-h-64"
                    muted
                  />
                ) : (
                  <img
                    src={filePreviewUrl}
                    alt="Preview"
                    className="h-full w-full object-cover max-h-64"
                  />
                )}
              </div>
            ) : null}
            <p className="text-sm text-slate-600">{file.name}</p>
            <p className="text-xs text-slate-400">
              {(file.size / 1024 / 1024).toFixed(2)} MB · toque para trocar
            </p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">
              Arraste ou toque pra escolher arquivo
            </p>
          </>
        )}
      </div>

      {/* Legenda */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Legenda (opcional)
        </label>
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          disabled={busy}
          className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 resize-none rounded-xl"
          placeholder="Conta pra elas o que é…"
        />
      </div>

      {/* Como vender */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Como você quer vender?
        </label>
        <div className="grid grid-cols-2 gap-2">
          <SegmentCard
            selected={deliveryMode === "catalog"}
            disabled={busy}
            onClick={() => setDeliveryMode("catalog")}
            title="Catálogo"
            subtitle="Grátis p/ assinantes"
          />
          <SegmentCard
            selected={deliveryMode === "ondemand"}
            disabled={busy}
            onClick={() => setDeliveryMode("ondemand")}
            title="Venda avulsa"
            subtitle={
              deliveryMode === "ondemand" ? undefined : "Compra avulsa"
            }
          >
            {deliveryMode === "ondemand" && (
              <div
                className="mt-2 flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs text-slate-500">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={busy}
                  placeholder="0,00"
                  className="h-8 text-sm bg-white border-slate-300 focus:border-primary-400"
                />
              </div>
            )}
          </SegmentCard>
        </div>
      </div>

      {/* Quando */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Quando enviar?
        </label>
        <div className="grid grid-cols-2 gap-2">
          <SegmentCard
            selected={when === "now"}
            disabled={busy}
            onClick={() => setWhen("now")}
            title="Agora"
          />
          <SegmentCard
            selected={when === "later"}
            disabled={busy}
            onClick={() => setWhen("later")}
            title="Depois"
            subtitle={
              when === "later" ? undefined : "Escolher dia e hora"
            }
          >
            {when === "later" && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={busy}
                  className="h-8 text-sm bg-white border-slate-300 focus:border-primary-400"
                />
              </div>
            )}
          </SegmentCard>
        </div>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={busy || !file}
        className="w-full h-14 text-base font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {progress ?? "Enviando…"}
          </>
        ) : (
          primaryLabel
        )}
      </Button>
    </div>
  );
}

interface SegmentCardProps {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

function SegmentCard({
  selected,
  disabled,
  onClick,
  title,
  subtitle,
  children,
}: SegmentCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors disabled:opacity-60 ${
        selected
          ? "border-primary-500 bg-primary-50/50 ring-1 ring-primary-500/20"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <p
        className={`text-sm font-medium ${selected ? "text-primary-700" : "text-slate-700"}`}
      >
        {selected && "✓ "}
        {title}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      )}
      {children}
    </button>
  );
}
