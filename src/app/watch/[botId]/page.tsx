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

  // Checagem mínima: live existe e está ativa.
  // A autorização completa (paywall + JWT) é feita em /api/live/access,
  // chamado pelo WatchPlayer no client-side.
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

  return (
    <WatchPlayer
      botId={botId}
      viewerToken={token}
      title={liveStream.title ?? "Ao Vivo"}
    />
  );
}
