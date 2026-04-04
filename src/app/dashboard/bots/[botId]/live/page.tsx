"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Camera, CameraOff, Loader2, Radio } from "lucide-react";

import { getLiveStream, toggleLive } from "@/server/actions/live.actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LiveBroadcastPage() {
  const params = useParams();
  const botId = params.botId as string;

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [liveTitle, setLiveTitle] = useState("");

  const mediamtxUrl = process.env.NEXT_PUBLIC_MEDIAMTX_URL || "http://localhost:8889";

  // Carregar config da live
  useEffect(() => {
    async function load() {
      try {
        const result = await getLiveStream(botId);
        if (result.success && result.data) {
          setStreamKey(result.data.id);
          setIsLive(result.data.isLive);
          setLiveTitle(result.data.title ?? "Transmissão ao vivo");
        } else {
          toast.error("Configure a live antes de transmitir (aba Live nas configurações)");
        }
      } catch {
        toast.error("Erro ao carregar dados da live");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [botId]);

  // Iniciar câmera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch (e) {
      console.error("[Broadcast] Erro ao acessar câmera:", e);
      toast.error("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  }, []);

  // Parar câmera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // Iniciar transmissão via WHIP
  const startBroadcast = useCallback(async () => {
    if (!streamRef.current || !streamKey) return;

    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Adicionar tracks da câmera
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current!);
      });

      // Criar offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Enviar via WHIP para o MediaMTX
      const whipUrl = `${mediamtxUrl}/live/${botId}/whip?key=${streamKey}`;
      const res = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription!.sdp,
      });

      if (!res.ok) {
        throw new Error(`WHIP falhou: ${res.status}`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      setIsBroadcasting(true);
      toast.success("Transmissão iniciada!");
    } catch (e) {
      console.error("[Broadcast] Erro ao iniciar WHIP:", e);
      toast.error("Erro ao iniciar transmissão. Verifique a conexão.");
      pcRef.current?.close();
      pcRef.current = null;
    }
  }, [streamKey, botId, mediamtxUrl]);

  // Parar transmissão
  const stopBroadcast = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setIsBroadcasting(false);
    toast.info("Transmissão encerrada");
  }, []);

  // Ativar/desativar live no sistema (notifica assinantes)
  async function handleToggleLive() {
    setIsToggling(true);
    try {
      const result = await toggleLive(botId);
      if (result.success) {
        const newState = result.data?.isLive ?? false;
        setIsLive(newState);
        toast.success(newState ? "Live ativada! Assinantes notificados." : "Live desativada.");
      } else {
        toast.error(result.error ?? "Erro ao alterar status da live");
      }
    } catch {
      toast.error("Erro ao alterar status da live");
    } finally {
      setIsToggling(false);
    }
  }

  // Cleanup ao sair da página
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!streamKey) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 hover:bg-slate-50">
            <Link href={`/dashboard/bots/${botId}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-16 text-center">
            <p className="text-slate-500">
              Configure a live nas configurações do bot (aba Live) antes de transmitir.
            </p>
            <Button asChild className="mt-4 bg-primary-600 hover:bg-primary-700 text-white">
              <Link href={`/dashboard/bots/${botId}/settings`}>
                Ir para Configurações
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 hover:bg-slate-50">
          <Link href={`/dashboard/bots/${botId}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transmitir ao Vivo</h1>
          <p className="text-sm text-slate-400">{liveTitle}</p>
        </div>
        {isLive && (
          <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1">
            <Radio className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-600">AO VIVO</span>
          </div>
        )}
      </div>

      {/* Preview da câmera */}
      <Card className="bg-black border-slate-200/60 rounded-xl overflow-hidden">
        <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
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
              <p className="text-sm">Clique em &quot;Abrir Câmera&quot; para começar</p>
            </div>
          )}
          {isBroadcasting && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1">
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-medium text-white">TRANSMITINDO</span>
            </div>
          )}
        </div>
      </Card>

      {/* Controles */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base">Controles</CardTitle>
          <CardDescription className="text-slate-400">
            Abra a câmera, inicie a transmissão e ative a live para os assinantes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {/* Câmera */}
            {!cameraReady ? (
              <Button
                onClick={startCamera}
                className="bg-slate-700 hover:bg-slate-800 text-white"
              >
                <Camera className="mr-2 h-4 w-4" />
                Abrir Câmera
              </Button>
            ) : (
              <Button
                onClick={() => { stopBroadcast(); stopCamera(); }}
                variant="outline"
                className="border-slate-200 text-slate-700"
                disabled={isBroadcasting}
              >
                <CameraOff className="mr-2 h-4 w-4" />
                Fechar Câmera
              </Button>
            )}

            {/* Transmissão */}
            {cameraReady && !isBroadcasting && (
              <Button
                onClick={startBroadcast}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Radio className="mr-2 h-4 w-4" />
                Iniciar Transmissão
              </Button>
            )}
            {isBroadcasting && (
              <Button
                onClick={stopBroadcast}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                Parar Transmissão
              </Button>
            )}

            {/* Ativar live (notifica assinantes) */}
            {isBroadcasting && (
              <Button
                onClick={handleToggleLive}
                disabled={isToggling}
                className={
                  isLive
                    ? "bg-slate-600 hover:bg-slate-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }
              >
                {isToggling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isLive ? "Desativar Live" : "Ativar Live (notificar)"}
              </Button>
            )}
          </div>

          {isBroadcasting && !isLive && (
            <p className="text-xs text-amber-600 mt-3">
              Você está transmitindo mas a live ainda não está visível para os assinantes.
              Clique em &quot;Ativar Live&quot; quando estiver pronto.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
