"use client";

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";

interface WatchPlayerProps {
  streamUrl: string;
  title: string;
}

export function WatchPlayer({ streamUrl, title }: WatchPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: any = null;

    async function initPlayer() {
      if (!video) return;

      // HLS.js via CDN dinâmico
      const Hls = (await import("hls.js")).default;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          video?.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setError("Erro de conexão. A transmissão pode ter encerrado.");
            } else {
              setError("Erro ao reproduzir a transmissão.");
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari nativo
        video.src = streamUrl;
        video.addEventListener("loadedmetadata", () => {
          setLoading(false);
          video.play().catch(() => {});
        });
      } else {
        setError("Seu navegador não suporta reprodução de vídeo ao vivo.");
      }
    }

    initPlayer();

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [streamUrl]);

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
