import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

type StorageConfig = {
  provider: string;
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let cachedConfig: StorageConfig | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getStorageConfig(): Promise<StorageConfig> {
  if (cachedConfig && Date.now() < cacheExpiry) {
    return cachedConfig;
  }

  const settings = await db.platformSetting.findMany();
  const map = new Map(settings.map((s) => [s.key, s]));

  const getValue = (key: string): string => {
    const s = map.get(key);
    if (!s) return "";
    return s.isEncrypted ? decrypt(s.value) : s.value;
  };

  cachedConfig = {
    provider: getValue("storage_provider") || "s3",
    bucket: getValue("storage_bucket"),
    region: getValue("storage_region") || "us-east-1",
    endpoint: getValue("storage_endpoint") || undefined,
    accessKeyId: getValue("storage_access_key_id"),
    secretAccessKey: getValue("storage_secret_access_key"),
  };

  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedConfig;
}

export function invalidateStorageCache(): void {
  cachedConfig = null;
  cacheExpiry = 0;
}

export async function getS3Client(): Promise<{
  client: S3Client;
  config: StorageConfig;
}> {
  const config = await getStorageConfig();

  const endpoint =
    config.provider === "wasabi"
      ? `https://s3.${config.region}.wasabisys.com`
      : config.endpoint || undefined;

  const client = new S3Client({
    region: config.region,
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.provider === "wasabi",
  });

  return { client, config };
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const { client, config } = await getS3Client();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn = 900
): Promise<string> {
  const { client, config } = await getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Sobe um arquivo do disco pro storage. Usado pelo worker que gera
 * variante leve de vídeo via ffmpeg.
 */
export async function putObjectFromFile(args: {
  key: string;
  filePath: string;
  contentType?: string;
}): Promise<void> {
  const { createReadStream } = await import("fs");
  const { stat } = await import("fs/promises");
  const { client, config } = await getS3Client();
  const fileStat = await stat(args.filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: args.key,
      Body: createReadStream(args.filePath),
      ContentType: args.contentType ?? "application/octet-stream",
      ContentLength: fileStat.size,
    })
  );
}

/**
 * Sobe um Buffer pro storage. Usado por endpoints que recebem upload
 * via multipart e processam server-side (ex: compressão de imagem).
 */
export async function putObjectFromBuffer(args: {
  key: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<void> {
  const { client, config } = await getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: args.key,
      Body: args.buffer,
      ContentType: args.contentType ?? "application/octet-stream",
      ContentLength: args.buffer.length,
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, config } = await getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );
}

export async function getPublicUrl(key: string): Promise<string> {
  return generatePresignedDownloadUrl(key);
}

/**
 * Baixa um objeto do storage como stream Node. Usado pra enviar mídia
 * direto ao Telegram via multipart (limite 50 MB) em vez de URL (limite
 * 20 MB), e também pelo worker que gera variante leve via ffmpeg.
 */
export async function getObjectStream(key: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentLength: number;
  contentType: string;
}> {
  const { client, config } = await getS3Client();
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  );
  if (!res.Body) {
    throw new Error(`Storage GetObject sem body para key=${key}`);
  }
  return {
    stream: res.Body as NodeJS.ReadableStream,
    contentLength: res.ContentLength ?? 0,
    contentType: res.ContentType ?? "application/octet-stream",
  };
}

export async function testConnection(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { client, config } = await getS3Client();
    await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        MaxKeys: 1,
      })
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
