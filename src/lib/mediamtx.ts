import { randomUUID } from "crypto";

/**
 * Client fino para a API do MediaMTX.
 *
 * Estratégia: paths efêmeros identificados por UUID criados na hora de
 * iniciar um broadcast, deletados ao encerrar. Cada path tem um
 * `runOnReady` que dispara ffmpeg para repassar o WebRTC recebido
 * como RTMPS para o IVS.
 *
 * Segurança: a URL WHIP é a capability — só quem tem a URL completa
 * publica. O path some do MediaMTX quando o broadcast é encerrado.
 */

const MEDIAMTX_API_URL =
  process.env.MEDIAMTX_API_URL ?? "http://botfans-mediamtx-api:9997";

const MEDIAMTX_PUBLIC_HOST =
  process.env.MEDIAMTX_PUBLIC_HOST ?? "live.botfans.com.br";

export interface BroadcastPathInfo {
  path: string;
  whipUrl: string;
}

interface CreatePathArgs {
  botId: string;
  ivsIngestEndpoint: string; // ex: rtmps://xxxxxx.global-contribute.live-video.net:443/app/
  ivsStreamKey: string;
}

/**
 * Cria um path dinâmico no MediaMTX que, ao receber um publisher
 * WebRTC, dispara ffmpeg para repassar em RTMPS para o IVS.
 *
 * Retorna a URL WHIP completa que o browser deve usar para publicar.
 */
export async function createBroadcastPath(
  args: CreatePathArgs
): Promise<BroadcastPathInfo> {
  const token = randomUUID();
  const path = `live/${args.botId}/${token}`;

  // IVS ingest endpoint vem como `rtmps://xxx:443/app/` (sem a key no final).
  // O ffmpeg precisa que a stream key seja anexada ao URL de saída.
  const ingestBase = args.ivsIngestEndpoint.endsWith("/")
    ? args.ivsIngestEndpoint
    : `${args.ivsIngestEndpoint}/`;
  const ivsUrl = `${ingestBase}${args.ivsStreamKey}`;

  // ffmpeg comando:
  //   - copia vídeo (browser manda H264 por força do setCodecPreferences)
  //   - transcoda áudio Opus → AAC 128kbps 48kHz (IVS requer AAC)
  //   - envia como FLV via RTMPS para o IVS
  const runOnReady = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    `rtmp://localhost:1935/$MTX_PATH`,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-b:a",
    "128k",
    "-f",
    "flv",
    ivsUrl,
  ]
    .map((a) => `"${a.replace(/"/g, '\\"')}"`)
    .join(" ");

  const body = {
    source: "publisher",
    runOnReady,
    runOnReadyRestart: false,
    // Garante que o ffmpeg é matado quando não houver mais leitores / o path
    // é deletado. Protege contra leaks se o encerramento falhar.
    runOnNotReady: "pkill -P $$ ffmpeg || true",
  };

  const resp = await fetch(
    `${MEDIAMTX_API_URL}/v3/config/paths/add/${encodeURI(path)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `MediaMTX createPath falhou: HTTP ${resp.status} — ${text}`
    );
  }

  return {
    path,
    whipUrl: `https://${MEDIAMTX_PUBLIC_HOST}/${path}/whip`,
  };
}

/**
 * Remove o path do MediaMTX. Idempotente: se o path já não existe,
 * ignora o 404. O ffmpeg associado morre junto (via runOnNotReady).
 */
export async function deleteBroadcastPath(path: string): Promise<void> {
  const resp = await fetch(
    `${MEDIAMTX_API_URL}/v3/config/paths/delete/${encodeURI(path)}`,
    { method: "DELETE" }
  );
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `MediaMTX deletePath falhou: HTTP ${resp.status} — ${text}`
    );
  }
}
