"use client";

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";

interface WatchPlayerProps {
  botId: string;
  viewerToken: string;
  title: string;
}

interface AccessResponse {
  playbackUrl: string;
  expiresAt: string;
  title: string;
}

/**
 * Player de live usando Amazon IVS Player SDK.
 *
 * Fluxo:
 *   1. Client-side: chama GET /api/live/access?botId=...&token=<viewerToken>
 *      → backend valida paywall e devolve playback URL com JWT signed (1h).
 *   2. Carrega dinamicamente `amazon-ivs-player` (evita SSR), cria player.
 *   3. Toca o URL retornado. Quando o JWT expira (~1h), tenta refresh.
 *
 * Fallback: se a lib IVS não carregar, mostra mensagem de erro — evita
 * quebrar o build se o pacote não estiver instalado em dev.
 */
export function WatchPlayer({ botId, viewerToken, title }: WatchPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadAndPlay() {
      try {
        // 1. Busca playback URL signed
        const resp = await fetch(
          `/api/live/access?botId=${encodeURIComponent(botId)}&token=${encodeURIComponent(viewerToken)}`,
          { cache: "no-store" }
        );

        if (!resp.ok) {
          const data = (await resp.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!cancelled) {
            setError(data.error ?? "Acesso negado");
            setLoading(false);
          }
          return;
        }

        const { playbackUrl, expiresAt } = (await resp.json()) as AccessResponse;

        // 2. Carrega o IVS Player SDK dinamicamente (evita SSR)
        //    Pacote amazon-ivs-player exporta utilitários pra inicializar
        //    o player sobre um <video> tag.
        const ivsModule = (await import("amazon-ivs-player")) as {
          isPlayerSupported: boolean;
          create: (opts: { wasmWorker: string; wasmBinary: string }) => unknown;
          MediaPlayer: unknown;
          PlayerEventType: Record<string, string>;
          PlayerState: Record<string, string>;
        };

        if (!ivsModule.isPlayerSupported) {
          if (!cancelled) {
            setError("Seu navegador não suporta reprodução ao vivo (IVS).");
            setLoading(false);
          }
          return;
        }

        // Assets WASM servidos de CDN oficial da AWS.
        // Pra servir local, copiar do node_modules/amazon-ivs-player/dist/ pra /public.
        const wasmWorker =
          "https://player.live-video.net/1.24.0/amazon-ivs-wasmworker.min.js";
        const wasmBinary =
          "https://player.live-video.net/1.24.0/amazon-ivs-wasmworker.min.wasm";

        const player = ivsModule.create({ wasmWorker, wasmBinary }) as {
          attachHTMLVideoElement: (el: HTMLVideoElement) => void;
          load: (url: string) => void;
          play: () => void;
          delete: () => void;
          addEventListener: (event: string, cb: (data?: unknown) => void) => void;
        };

        playerRef.current = player;

        if (!videoRef.current || cancelled) return;

        player.attachHTMLVideoElement(videoRef.current);

        player.addEventListener(ivsModule.PlayerEventType.ERROR, (data) => {
          console.error("[IVS Player] erro:", data);
          if (!cancelled) setError("Erro ao reproduzir a transmissão.");
        });

        player.addEventListener(ivsModule.PlayerEventType.STATE_CHANGED, () => {
          if (!cancelled) setLoading(false);
        });

        player.load(playbackUrl);
        player.play();

        // 3. Agenda refresh da URL antes do JWT expirar (com 60s de folga)
        const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
        const refreshIn = Math.max(30_000, msUntilExpiry - 60_000);
        refreshTimer = setTimeout(() => {
          if (!cancelled) loadAndPlay();
        }, refreshIn);
      } catch (e) {
        console.error("[WatchPlayer] falha geral:", e);
        if (!cancelled) {
          setError("Não foi possível inicializar o player.");
          setLoading(false);
        }
      }
    }

    loadAndPlay();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (playerRef.current) {
        try {
          (playerRef.current as { delete?: () => void }).delete?.();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [botId, viewerToken]);

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80">
        <div className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1">
          <Radio className="h-3.5 w-3.5 text-white animate-pulse" />
          <span className="text-xs font-medium text-white">AO VIVO</span>
        </div>
        <h1 className="text-white text-sm font-medium truncate">{title}</h1>
      </div>

      {/* Player */}
      <div className="flex-1 flex items-center justify-center relative">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="text-center">
              <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/60 text-sm">Carregando transmissão...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10 px-4">
            <div className="text-center">
              <p className="text-white text-lg">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          controls
          playsInline
          autoPlay
          className="w-full h-full max-h-screen object-contain"
        />
      </div>
    </div>
  );
}
