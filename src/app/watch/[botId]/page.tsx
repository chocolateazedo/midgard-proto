import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { WatchPlayer } from "./watch-player";

interface WatchPageProps {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { botId } = await params;
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-lg">Acesso negado. Use o link enviado pelo bot.</p>
      </div>
    );
  }

  // Verificar se a live existe e está ativa
  const liveStream = await db.liveStream.findUnique({ where: { botId } });
  if (!liveStream || !liveStream.isLive) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center px-4">
        <div>
          <p className="text-white text-lg">Nenhuma transmissão ao vivo no momento</p>
          <p className="text-slate-400 text-sm mt-2">Volte quando o criador estiver transmitindo</p>
        </div>
      </div>
    );
  }

  const hlsUrl = process.env.NEXT_PUBLIC_HLS_URL || "http://localhost:8888";
  const streamUrl = `${hlsUrl}/live/${botId}/index.m3u8?token=${token}`;

  return (
    <WatchPlayer
      streamUrl={streamUrl}
      title={liveStream.title ?? "Ao Vivo"}
    />
  );
}
