"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, CameraOff, Loader2, Radio, X } from "lucide-react";

import {
  listLiveSchedules,
  createLiveSchedule,
  beginBrowserBroadcast,
  endBrowserBroadcast,
} from "@/server/actions/live-schedule.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Schedule {
  id: string;
  botId: string;
  title: string;
  price: string | number;
  notifySubscribers: boolean;
  startAt: string | Date;
  endAt: string | Date;
  status: "scheduled" | "started" | "ended" | "cancelled" | "missed";
  actualStartAt: string | Date | null;
  actualEndAt: string | Date | null;
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function formatDateTime(v: string | Date): string {
  return toDate(v).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Chip = "today" | "tomorrow" | "saturday" | "custom";

function chipTargetDate(chip: Chip, customDate: string, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  if (chip === "tomorrow") d.setDate(d.getDate() + 1);
  else if (chip === "saturday") {
    const daysUntilSat = (6 - d.getDay() + 7) % 7;
    if (daysUntilSat === 0) {
      const candidate = new Date(d);
      candidate.setHours(hh, mm, 0, 0);
      if (candidate.getTime() <= Date.now()) d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + daysUntilSat);
    }
  } else if (chip === "custom") {
    const [yy, mo, dd] = customDate.split("-").map((n) => parseInt(n, 10));
    d.setFullYear(yy, mo - 1, dd);
  }
  d.setHours(hh, mm, 0, 0);
  return d;
}

function formatSaturday(): string {
  const d = new Date();
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function LivePage() {
  const params = useParams();
  const router = useRouter();
  const botId = params.botId as string;

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [activeBroadcast, setActiveBroadcast] = useState<Schedule | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [startingBroadcast, setStartingBroadcast] = useState(false);

  const [scheduling, setScheduling] = useState(false);
  const [startingNow, setStartingNow] = useState(false);

  // Agendamento
  const [chip, setChip] = useState<Chip>("today");
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [hhmm, setHhmm] = useState("21:00");
  const [notifySubscribers, setNotifySubscribers] = useState(true);

  const load = useCallback(async () => {
    const res = await listLiveSchedules(botId);
    if (res.success && res.data) {
      const list = res.data as unknown as Schedule[];
      setSchedules(list);
      const started = list.find((s) => s.status === "started");
      if (started && !activeBroadcast) setActiveBroadcast(started);
    }
    setLoading(false);
  }, [botId, activeBroadcast]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  // Próximo schedule "scheduled" com janela ainda viva (endAt no futuro).
  // Inclui os que ainda não começaram — a tela mostra preview + contagem
  // enquanto a modelo aguarda o horário, e só libera "Iniciar transmissão"
  // quando startAt <= now.
  const upcoming =
    schedules
      .filter(
        (s) => s.status === "scheduled" && toDate(s.endAt) > now
      )
      .sort(
        (a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime()
      )[0] ?? null;
  const target = activeBroadcast ?? upcoming;

  // ─── Sync do preview da câmera ───
  // O srcObject é atribuído em startCamera, mas se o <video> só monta depois
  // (ex.: target passa a existir após createLiveSchedule), o ref era null
  // naquele momento. Esse efeito re-atribui sempre que o estado relevante
  // muda, garantindo que o preview aparece.
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }
  }, [cameraReady, target]);

  // ─── Camera / Broadcast ───

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
    } catch (e) {
      console.error("[Live] getUserMedia:", e);
      toast.error("Não foi possível acessar câmera/microfone");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const startBroadcast = useCallback(
    async (schedule: Schedule) => {
      if (!streamRef.current) {
        toast.error("Abra a câmera primeiro");
        return;
      }
      setStartingBroadcast(true);
      try {
        const res = await beginBrowserBroadcast(schedule.id);
        if (!res.success || !res.data) {
          toast.error(res.error ?? "Erro ao iniciar transmissão");
          return;
        }
        const { whipUrl, endAt } = res.data;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        streamRef.current.getTracks().forEach((track) => {
          const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
          if (track.kind === "video") {
            const caps = RTCRtpSender.getCapabilities?.("video");
            const codecs = caps?.codecs ?? [];
            const h264 = codecs.filter((c) => c.mimeType === "video/H264");
            const others = codecs.filter((c) => c.mimeType !== "video/H264");
            if (h264.length > 0 && transceiver.setCodecPreferences) {
              transceiver.setCodecPreferences([...h264, ...others]);
            }
          }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const whipResp = await fetch(whipUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription!.sdp,
        });
        if (!whipResp.ok) throw new Error(`WHIP HTTP ${whipResp.status}`);

        const answerSdp = await whipResp.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        const msUntilEnd = toDate(endAt).getTime() - Date.now();
        if (msUntilEnd > 0 && msUntilEnd < 6 * 3600_000) {
          autoStopTimerRef.current = setTimeout(() => {
            toast.info("Horário encerrado — transmissão finalizada.");
            void stopBroadcast();
          }, msUntilEnd);
        }

        setActiveBroadcast(schedule);
        setIsBroadcasting(true);
        toast.success("Ao vivo!");
      } catch (e) {
        console.error("[Live] broadcast erro:", e);
        toast.error(e instanceof Error ? e.message : "Erro ao iniciar");
        pcRef.current?.close();
        pcRef.current = null;
      } finally {
        setStartingBroadcast(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const stopBroadcast = useCallback(async () => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
    setIsBroadcasting(false);

    if (activeBroadcast) {
      const res = await endBrowserBroadcast(activeBroadcast.id);
      if (!res.success) toast.error(res.error ?? "Erro ao encerrar");
    }
    setActiveBroadcast(null);
    await load();
  }, [activeBroadcast, load]);

  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ─── Ações ───

  async function handleStartNow() {
    setStartingNow(true);
    try {
      // Mínimo 10min de antecedência no backend — criamos schedule daqui a
      // 11min com 60min de duração e já abrimos a câmera pra modelo se
      // preparar enquanto aguarda.
      const start = new Date(Date.now() + 11 * 60_000);
      const end = new Date(start.getTime() + 60 * 60_000);
      const res = await createLiveSchedule({
        botId,
        title: "Live agora",
        description: null,
        price: 0,
        // Sempre avisa assinantes quando a modelo escolhe "começar agora" —
        // disparo em T-10/T-5/T-1/T-0 cai como aviso de "vai começar".
        notifySubscribers: true,
        startAt: start,
        endAt: end,
      });
      if (!res.success) {
        toast.error(res.error ?? "Erro ao criar live");
        return;
      }
      toast.success(
        "Live preparada — começa em 10min. Seus assinantes serão avisados. Abra a câmera!"
      );
      await load();
      void startCamera();
    } finally {
      setStartingNow(false);
    }
  }

  async function handleSchedule() {
    setScheduling(true);
    try {
      const start = chipTargetDate(chip, customDate, hhmm);
      if (start.getTime() < Date.now() + 10 * 60_000) {
        toast.error("Agende com pelo menos 10 minutos de antecedência");
        return;
      }
      const end = new Date(start.getTime() + 60 * 60_000);
      const res = await createLiveSchedule({
        botId,
        title: "Live",
        description: null,
        price: 0,
        notifySubscribers,
        startAt: start,
        endAt: end,
      });
      if (!res.success) {
        toast.error(res.error ?? "Erro ao agendar");
        return;
      }
      toast.success(`Pronto! Agendada pra ${formatDateTime(start)}.`);
      router.push(`/dashboard/bots/${botId}`);
    } finally {
      setScheduling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-2">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Live</h1>
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

      {/* Painel de broadcast quando há live ativa ou futura */}
      {target ? (
        <BroadcastPanel
          active={activeBroadcast}
          target={target}
          videoRef={videoRef}
          cameraReady={cameraReady}
          isBroadcasting={isBroadcasting}
          startingBroadcast={startingBroadcast}
          startCamera={startCamera}
          stopCamera={stopCamera}
          startBroadcast={startBroadcast}
          stopBroadcast={stopBroadcast}
        />
      ) : (
        <>
          {/* Começar agora */}
          <Button
            onClick={handleStartNow}
            disabled={startingNow}
            className="w-full h-14 text-base font-medium bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm disabled:opacity-60"
          >
            {startingNow ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Radio className="mr-2 h-5 w-5" />
            )}
            Começar live agora
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">ou</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Agendar */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-slate-700">Agendar live</h2>

            <div className="grid grid-cols-4 gap-2">
              <ChipButton label="Hoje" selected={chip === "today"} onClick={() => setChip("today")} />
              <ChipButton label="Amanhã" selected={chip === "tomorrow"} onClick={() => setChip("tomorrow")} />
              <ChipButton
                label={`Sáb ${formatSaturday()}`}
                selected={chip === "saturday"}
                onClick={() => setChip("saturday")}
              />
              <ChipButton label="Outra" selected={chip === "custom"} onClick={() => setChip("custom")} />
            </div>

            {chip === "custom" && (
              <div>
                <Label className="text-xs text-slate-500">Data</Label>
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="mt-1 bg-white border-slate-200"
                />
              </div>
            )}

            <div>
              <Label className="text-xs text-slate-500">Hora</Label>
              <Input
                type="time"
                value={hhmm}
                onChange={(e) => setHhmm(e.target.value)}
                className="mt-1 bg-white border-slate-200"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm text-slate-700">Avisar assinantes?</p>
                <p className="text-xs text-slate-400">Envia mensagem quando começar</p>
              </div>
              <Switch
                checked={notifySubscribers}
                onCheckedChange={setNotifySubscribers}
                className="data-[state=checked]:bg-primary-600"
              />
            </div>

            <Button
              onClick={handleSchedule}
              disabled={scheduling}
              className="w-full h-14 text-base font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl disabled:opacity-60"
            >
              {scheduling ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              Agendar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ChipButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-2 text-xs transition-colors ${
        selected
          ? "border-primary-500 bg-primary-50/50 text-primary-700 ring-1 ring-primary-500/20"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

interface BroadcastPanelProps {
  active: Schedule | null;
  target: Schedule;
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraReady: boolean;
  isBroadcasting: boolean;
  startingBroadcast: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startBroadcast: (s: Schedule) => Promise<void>;
  stopBroadcast: () => Promise<void>;
}

function BroadcastPanel({
  active,
  target,
  videoRef,
  cameraReady,
  isBroadcasting,
  startingBroadcast,
  startCamera,
  stopCamera,
  startBroadcast,
  stopBroadcast,
}: BroadcastPanelProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(
      0,
      Math.ceil((toDate(target.startAt).getTime() - Date.now()) / 1000)
    )
  );

  useEffect(() => {
    if (active) return;
    const id = setInterval(() => {
      setSecondsLeft(
        Math.max(
          0,
          Math.ceil((toDate(target.startAt).getTime() - Date.now()) / 1000)
        )
      );
    }, 1000);
    return () => clearInterval(id);
  }, [active, target.startAt]);

  const waiting = !active && secondsLeft > 0;
  const canStartBroadcast = !!active || secondsLeft === 0;
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {active
            ? "Transmitindo agora"
            : waiting
              ? `Começa em ${mm}:${String(ss).padStart(2, "0")}`
              : "Pronta para iniciar"}
        </p>
        <p className="text-xs text-slate-400">
          Encerra automaticamente às {formatDateTime(target.endAt)}
        </p>
      </div>

      <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${cameraReady ? "" : "hidden"}`}
        />
        {!cameraReady && (
          <div className="text-center text-slate-400">
            <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Abra a câmera para ver o preview</p>
          </div>
        )}
        {isBroadcasting && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1">
            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-medium text-white">TRANSMITINDO</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!cameraReady ? (
          <Button
            onClick={startCamera}
            className="flex-1 bg-slate-700 hover:bg-slate-800 text-white"
          >
            <Camera className="mr-2 h-4 w-4" />
            Abrir câmera
          </Button>
        ) : (
          <Button
            onClick={stopCamera}
            variant="outline"
            disabled={isBroadcasting}
            className="border-slate-200 text-slate-700"
          >
            <CameraOff className="mr-2 h-4 w-4" />
            Fechar câmera
          </Button>
        )}

        {cameraReady && !isBroadcasting && (
          <Button
            onClick={() => startBroadcast(target)}
            disabled={startingBroadcast || !canStartBroadcast}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
          >
            {startingBroadcast ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Radio className="mr-2 h-4 w-4" />
            )}
            {canStartBroadcast
              ? "Iniciar transmissão"
              : waiting
                ? `Aguarda ${mm}:${String(ss).padStart(2, "0")}`
                : "Aguarde…"}
          </Button>
        )}

        {isBroadcasting && (
          <Button
            onClick={stopBroadcast}
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            <X className="mr-2 h-4 w-4" />
            Encerrar
          </Button>
        )}
      </div>
    </div>
  );
}
