import { Api, TelegramClient } from "telegram";
import { computeCheck } from "telegram/Password";
import { StringSession } from "telegram/sessions";

import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

const BOTFATHER = "BotFather";
const TOKEN_REGEX = /(\d{8,10}:[A-Za-z0-9_-]{35})/;

type ConnectedCredentials = {
  apiId: number;
  apiHash: string;
  phone: string;
  session: string;
};

type PartialCredentials = {
  apiId: number;
  apiHash: string;
  phone: string;
};

async function readSetting(key: string): Promise<string | null> {
  const s = await db.platformSetting.findUnique({ where: { key } });
  return s?.value && s.value.length > 0 ? s.value : null;
}

async function writeSetting(
  key: string,
  value: string,
  isEncrypted = false,
  updatedBy?: string,
): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    update: { value, isEncrypted, updatedBy, updatedAt: new Date() },
    create: { key, value, isEncrypted, updatedBy },
  });
}

function safeDecrypt(raw: string): string {
  try {
    return decrypt(raw);
  } catch {
    return raw;
  }
}

async function getConnectedCredentials(): Promise<ConnectedCredentials | null> {
  const [apiIdRaw, apiHash, phone, sessionRaw] = await Promise.all([
    readSetting("telegram_api_id"),
    readSetting("telegram_api_hash"),
    readSetting("telegram_phone"),
    readSetting("telegram_session"),
  ]);
  if (!apiIdRaw || !apiHash || !phone || !sessionRaw) return null;
  const apiId = Number(apiIdRaw);
  if (!Number.isFinite(apiId)) return null;
  return { apiId, apiHash, phone, session: safeDecrypt(sessionRaw) };
}

function buildClient(apiId: number, apiHash: string, session: string): TelegramClient {
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
  });
}

export type TelegramStatus = {
  connected: boolean;
  configured: boolean;
  phone?: string;
  username?: string;
  firstName?: string;
};

export async function getStatus(): Promise<TelegramStatus> {
  const [apiId, apiHash, phone, sessionRaw, meRaw] = await Promise.all([
    readSetting("telegram_api_id"),
    readSetting("telegram_api_hash"),
    readSetting("telegram_phone"),
    readSetting("telegram_session"),
    readSetting("telegram_me"),
  ]);
  const connected = Boolean(sessionRaw);
  const configured = Boolean(apiId || apiHash || phone || sessionRaw);
  let username: string | undefined;
  let firstName: string | undefined;
  if (meRaw) {
    try {
      const me = JSON.parse(meRaw) as { username?: string | null; firstName?: string | null };
      username = me.username ?? undefined;
      firstName = me.firstName ?? undefined;
    } catch {
      // malformed cache; ignora
    }
  }
  return {
    connected,
    configured,
    phone: phone ?? undefined,
    username,
    firstName,
  };
}

export async function startLogin(
  params: PartialCredentials,
  updatedBy?: string,
): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
  if (!Number.isFinite(params.apiId) || params.apiId <= 0) {
    throw new Error("api_id inválido");
  }
  if (!params.apiHash || params.apiHash.length < 10) {
    throw new Error("api_hash inválido");
  }
  if (!params.phone || !params.phone.startsWith("+")) {
    throw new Error("Telefone deve começar com + e DDI (ex: +5511999999999)");
  }

  await Promise.all([
    writeSetting("telegram_api_id", String(params.apiId), false, updatedBy),
    writeSetting("telegram_api_hash", params.apiHash, false, updatedBy),
    writeSetting("telegram_phone", params.phone, false, updatedBy),
  ]);

  const client = buildClient(params.apiId, params.apiHash, "");
  try {
    await client.connect();
    const result = await client.sendCode(
      { apiId: params.apiId, apiHash: params.apiHash },
      params.phone,
    );
    // O Telegram vincula phoneCodeHash à conexão (DC + auth_key) que
    // pediu o código. Persistimos a session logo após sendCode pra que
    // verifyCode possa reconectar com o MESMO contexto — se reconectar
    // com session vazia, o servidor responde PHONE_CODE_EXPIRED mesmo
    // que o código ainda esteja válido.
    const partial = (client.session as StringSession).save();
    if (partial) {
      await writeSetting(
        "telegram_partial_session",
        encrypt(partial),
        true,
        updatedBy,
      );
    }
    return {
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.isCodeViaApp,
    };
  } finally {
    await safeDisconnect(client);
  }
}

export async function verifyCode(
  params: {
    phone: string;
    phoneCodeHash: string;
    code: string;
    password?: string;
  },
  updatedBy?: string,
): Promise<{ username: string | null; firstName: string | null }> {
  const apiIdRaw = await readSetting("telegram_api_id");
  const apiHash = await readSetting("telegram_api_hash");
  if (!apiIdRaw || !apiHash) {
    throw new Error("Credenciais Telegram não inicializadas — execute startLogin primeiro");
  }
  const apiId = Number(apiIdRaw);

  // Restaura a session salva no startLogin pra preservar o auth_key/DC
  // que o phoneCodeHash referencia. Sem isso → PHONE_CODE_EXPIRED.
  const partialRaw = await readSetting("telegram_partial_session");
  const partialSession = partialRaw ? safeDecrypt(partialRaw) : "";
  const client = buildClient(apiId, apiHash, partialSession);
  try {
    await client.connect();
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: params.phone,
          phoneCodeHash: params.phoneCodeHash,
          phoneCode: params.code,
        }),
      );
    } catch (err) {
      const message = extractErrorMessage(err);
      if (!message.includes("SESSION_PASSWORD_NEEDED")) {
        throw err;
      }
      if (!params.password) {
        throw new Error("Conta protegida por 2FA — informe a senha");
      }
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const srp = await computeCheck(passwordInfo, params.password);
      await client.invoke(new Api.auth.CheckPassword({ password: srp }));
    }

    const me = (await client.getMe()) as unknown as {
      id: { toString(): string };
      username?: string | null;
      firstName?: string | null;
    };

    const session = (client.session as StringSession).save();
    await writeSetting("telegram_session", encrypt(session), true, updatedBy);
    // Limpa session parcial — não é mais necessária após login completo.
    await writeSetting("telegram_partial_session", "", false, updatedBy);
    await writeSetting(
      "telegram_me",
      JSON.stringify({
        id: me.id.toString(),
        username: me.username ?? null,
        firstName: me.firstName ?? null,
      }),
      false,
      updatedBy,
    );

    return { username: me.username ?? null, firstName: me.firstName ?? null };
  } finally {
    await safeDisconnect(client);
  }
}

export async function disconnect(updatedBy?: string): Promise<void> {
  await Promise.all([
    writeSetting("telegram_session", "", false, updatedBy),
    writeSetting("telegram_partial_session", "", false, updatedBy),
    writeSetting("telegram_me", "", false, updatedBy),
  ]);
}

export type ProvisionBotLog = { direction: "out" | "in"; message: string; at: string };

export type ProvisionBotResult = {
  token: string;
  username: string;
  usernamesTried: string[];
  log: ProvisionBotLog[];
};

export async function createBotViaBotFather(opts: {
  botName: string;
  desiredUsername: string;
  maxAttempts?: number;
}): Promise<ProvisionBotResult> {
  const creds = await getConnectedCredentials();
  if (!creds) {
    throw new Error("Sessão MTProto não conectada — configure em /admin/settings");
  }
  const maxAttempts = opts.maxAttempts ?? 6;
  const candidates = buildUsernameCandidates(opts.desiredUsername, maxAttempts);
  const tried: string[] = [];
  const log: ProvisionBotLog[] = [];

  const client = buildClient(creds.apiId, creds.apiHash, creds.session);
  try {
    await client.connect();
    // Reset qualquer diálogo prévio com o BotFather antes de /newbot
    await sendAndWait(client, BOTFATHER, "/cancel", log, 8_000).catch(() => undefined);
    await sendAndWait(client, BOTFATHER, "/newbot", log);
    await sendAndWait(client, BOTFATHER, opts.botName, log);

    for (const candidate of candidates) {
      tried.push(candidate);
      const response = await sendAndWait(client, BOTFATHER, candidate, log);
      const match = response.match(TOKEN_REGEX);
      if (match) {
        return { token: match[1], username: candidate, usernamesTried: tried, log };
      }
      // BotFather respondeu que username é inválido/ocupado — loop tenta próxima
    }
    throw new Error(
      `Sem username disponível após ${tried.length} tentativas (@${tried.join(", @")})`,
    );
  } finally {
    await safeDisconnect(client);
  }
}

async function sendAndWait(
  client: TelegramClient,
  peer: string,
  text: string,
  log: ProvisionBotLog[],
  timeoutMs = 20_000,
): Promise<string> {
  // Captura maior id inbound atual como cursor antes de enviar
  const before = await client.getMessages(peer, { limit: 1 });
  const cursor = before.length > 0 ? before[0].id : 0;

  log.push({ direction: "out", message: text, at: new Date().toISOString() });
  await client.sendMessage(peer, { message: text });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const messages = await client.getMessages(peer, { limit: 3 });
    const fresh = messages
      .filter((m) => !m.out && m.id > cursor)
      .sort((a, b) => a.id - b.id)
      .pop();
    if (fresh) {
      const raw = (fresh.message ?? "").toString();
      log.push({ direction: "in", message: raw, at: new Date().toISOString() });
      return raw;
    }
  }
  throw new Error(`Timeout esperando resposta de @${peer} para "${text}"`);
}

function buildUsernameCandidates(desired: string, count: number): string[] {
  const base = desired
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  if (!base) {
    throw new Error("desiredUsername precisa conter ao menos 1 caractere alfanumérico");
  }
  const withBot = base.endsWith("bot") ? base : `${base}bot`;
  const pool = new Set<string>();
  pool.add(withBot);
  pool.add(`${base}_bot`);
  pool.add(`${base}fansbot`);
  while (pool.size < count) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    pool.add(`${base}${rand}bot`);
  }
  return Array.from(pool).slice(0, count);
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { errorMessage?: string; message?: string };
    return e.errorMessage ?? e.message ?? String(err);
  }
  return String(err);
}

async function safeDisconnect(client: TelegramClient): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // ignorar falhas de disconnect — conexão já pode estar fechada
  }
  try {
    await client.destroy();
  } catch {
    // idem
  }
}
