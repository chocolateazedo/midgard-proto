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
  publicBaseUrl?: string;
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
    publicBaseUrl: getValue("storage_public_base_url") || undefined,
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
  const config = await getStorageConfig();
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${key}`;
  }
  return generatePresignedDownloadUrl(key);
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
