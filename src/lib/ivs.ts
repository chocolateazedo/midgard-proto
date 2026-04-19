import {
  IvsClient,
  CreateChannelCommand,
  GetChannelCommand,
  GetStreamKeyCommand,
  DeleteChannelCommand,
  type Channel,
  type StreamKey,
} from "@aws-sdk/client-ivs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Wrapper fino sobre o SDK do IVS.
 *
 * Premissas:
 * - Região IVS fixa em us-east-1 (sa-east-1 não suporta IVS).
 * - Canais são criados UM POR BOT e reutilizados entre lives.
 * - Canais são PRIVATE (authorized=true) — playback exige JWT signed.
 * - Stream key é encriptado via AES-256-GCM antes de persistir no banco.
 * - JWT de playback é ES384 assinado com IVS_PLAYBACK_PRIVATE_KEY (PEM).
 */

const IVS_REGION = process.env.IVS_REGION ?? "us-east-1";
const JWT_EXPIRY_SECONDS = 60 * 60; // 1 hora — conforme requisito

let _client: IvsClient | null = null;

function getClient(): IvsClient {
  if (!_client) {
    _client = new IvsClient({ region: IVS_REGION });
  }
  return _client;
}

export interface IvsChannelInfo {
  channelArn: string;
  channelName: string;
  ingestEndpoint: string;
  playbackUrl: string;
  streamKeyArn: string;
  streamKeyEncrypted: string;
}

/**
 * Cria um canal IVS privado pra um bot. Retorna os dados já prontos pra
 * persistir em LiveStream. A stream key é criptografada antes de retornar.
 */
export async function createIvsChannelForBot(
  botId: string
): Promise<IvsChannelInfo> {
  const channelName = `botfans-${botId}`;

  const resp = await getClient().send(
    new CreateChannelCommand({
      name: channelName,
      type: "STANDARD", // suporta LL-HLS + ABR
      latencyMode: "LOW", // ultra-low latency (<3s)
      authorized: true, // canal privado — exige JWT signed pra playback
      insecureIngest: false,
      tags: {
        project: "botfans",
        botId,
      },
    })
  );

  const channel = resp.channel as Channel | undefined;
  const streamKey = resp.streamKey as StreamKey | undefined;

  if (
    !channel?.arn ||
    !channel?.ingestEndpoint ||
    !channel?.playbackUrl ||
    !streamKey?.arn ||
    !streamKey?.value
  ) {
    throw new Error("IVS CreateChannel retornou resposta incompleta");
  }

  return {
    channelArn: channel.arn,
    channelName,
    // IVS devolve o ingest sem protocolo — OBS espera rtmps://.../app
    ingestEndpoint: `rtmps://${channel.ingestEndpoint}:443/app/`,
    playbackUrl: channel.playbackUrl,
    streamKeyArn: streamKey.arn,
    streamKeyEncrypted: encrypt(streamKey.value),
  };
}

/**
 * Deleta um canal IVS (usado em rollback ou quando um bot é removido).
 * Falha silenciosa — caller decide se loga.
 */
export async function deleteIvsChannel(channelArn: string): Promise<void> {
  await getClient().send(new DeleteChannelCommand({ arn: channelArn }));
}

/**
 * Refresca o stream key decriptado pra um canal existente (usado pra
 * exibir pro creator copiar no OBS, sem persistir em logs).
 */
export async function getDecryptedStreamKey(
  encryptedStreamKey: string
): Promise<string> {
  return decrypt(encryptedStreamKey);
}

/**
 * Confirma que o canal ainda existe no IVS (usado como health check).
 */
export async function channelExists(channelArn: string): Promise<boolean> {
  try {
    await getClient().send(new GetChannelCommand({ arn: channelArn }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-busca o stream key do IVS (útil se o banco perder o valor encriptado).
 */
export async function fetchStreamKeyValue(streamKeyArn: string): Promise<string> {
  const resp = await getClient().send(
    new GetStreamKeyCommand({ arn: streamKeyArn })
  );
  const value = resp.streamKey?.value;
  if (!value) {
    throw new Error("IVS GetStreamKey não retornou valor");
  }
  return value;
}

/**
 * Gera JWT ES384 assinado pra playback de canal privado.
 *
 * Requer env IVS_PLAYBACK_PRIVATE_KEY contendo o PEM da chave ECDSA P-384
 * correspondente ao playback key pair importado no IVS.
 *
 * Payload segue spec do IVS:
 *   - aws:channel-arn  (obrigatório)
 *   - exp              (unix epoch)
 *
 * Campos opcionais (não usados por enquanto):
 *   - aws:access-control-allow-origin
 *   - aws:strict-origin-enforcement
 */
export function signPlaybackToken(channelArn: string): {
  token: string;
  expiresAt: Date;
} {
  const privateKey = process.env.IVS_PLAYBACK_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "IVS_PLAYBACK_PRIVATE_KEY não configurada — importe uma playback key pair no IVS primeiro"
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_EXPIRY_SECONDS;

  const token = jwt.sign(
    {
      "aws:channel-arn": channelArn,
      exp,
    },
    privateKey,
    {
      algorithm: "ES384",
      jwtid: randomUUID(),
    }
  );

  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Monta a URL completa de playback pronta pro player IVS consumir.
 * Formato: https://<playbackUrl>?token=<jwt>
 */
export function buildSignedPlaybackUrl(
  channelPlaybackUrl: string,
  channelArn: string
): { url: string; expiresAt: Date } {
  const { token, expiresAt } = signPlaybackToken(channelArn);
  const sep = channelPlaybackUrl.includes("?") ? "&" : "?";
  return {
    url: `${channelPlaybackUrl}${sep}token=${token}`,
    expiresAt,
  };
}
