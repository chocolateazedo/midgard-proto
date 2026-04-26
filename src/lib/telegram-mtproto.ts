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

/**
 * Verifica se o usuário MTProto conectado é membro de um canal
 * específico. Retorna null quando não há sessão MTProto ativa
 * (caller decide o que fazer com a falta de info).
 *
 * Implementação leve: 1 round-trip pra getDialogs e match local.
 * Pra checagens em massa, prefira listMtprotoChannelMembership.
 */
export async function isMtprotoMemberOfChannel(
  channelIdRaw: string,
): Promise<boolean | null> {
  const creds = await getConnectedCredentials();
  if (!creds) return null;

  // Bot API usa formato com -100 prefix; MTProto interno é positivo.
  const idPositive = channelIdRaw.startsWith("-100")
    ? channelIdRaw.slice(4)
    : channelIdRaw;

  const client = buildClient(creds.apiId, creds.apiHash, creds.session);
  try {
    await client.connect();
    const dialogs = await client.getDialogs({ limit: 500 });
    for (const d of dialogs) {
      const e = d.entity as unknown as { id?: { toString(): string } } | null;
      const id = e?.id?.toString();
      if (id === idPositive || id === channelIdRaw) return true;
    }
    return false;
  } catch {
    return null;
  } finally {
    await safeDisconnect(client);
  }
}

export type SyncAction =
  | "linked"      // bot ganhou channelId pela primeira vez
  | "updated"    // bot já tinha channel, mas trocou
  | "unchanged"   // já estava ligado nesse canal
  | "bot_unknown"; // admin do canal é um bot que NÃO existe na nossa DB

export interface SyncChannelItem {
  botId: string | null;
  botName: string;
  botUsername: string | null;
  channelId: string;
  channelTitle: string | null;
  action: SyncAction;
  previousChannelId?: string | null;
}

export interface SyncChannelsResult {
  channelsScanned: number;
  linked: number;
  updated: number;
  unchanged: number;
  unknownBots: number;
  items: SyncChannelItem[];
}

const SYNC_DELAY_MS = 2_000;

/**
 * Sincroniza Bot.channelId baseado nos canais que a conta MTProto é
 * membro. Usado quando webhooks de my_chat_member não chegaram (bot
 * adicionado como admin antes do webhook ser configurado, ou bug em
 * allowed_updates, ou evento perdido).
 *
 * Estratégia:
 * 1. getDialogs no MTProto pega canais visíveis pra essa conta.
 * 2. Pra cada canal broadcast, lista admins via channels.GetParticipants
 *    com filter=Admins.
 * 3. Pra cada admin que é bot, procura Bot na DB pelo username.
 * 4. Se Bot existe e channelId atual difere → atualiza
 *    (linked/updated). Se igual → unchanged. Se bot não existe na
 *    DB → bot_unknown (caso típico: bot do BotFather de outra
 *    plataforma também tá nesse canal).
 *
 * Pré-requisito: a conta MTProto precisa estar nos canais. Use
 * "Adicionar a todos os canais" antes se faltar algum.
 */
export async function syncBotsChannelsViaMtproto(): Promise<SyncChannelsResult> {
  const creds = await getConnectedCredentials();
  if (!creds) {
    throw new Error("Conta Telegram (MTProto) não está conectada");
  }

  const result: SyncChannelsResult = {
    channelsScanned: 0,
    linked: 0,
    updated: 0,
    unchanged: 0,
    unknownBots: 0,
    items: [],
  };

  const client = buildClient(creds.apiId, creds.apiHash, creds.session);
  try {
    await client.connect();

    const dialogs = await client.getDialogs({ limit: 500 });
    // Filtra entidades broadcast (canais), ignora groups/megagroups
    // e usuários. broadcast === true é a flag do Telegram pra canal.
    const channelEntities: Array<{
      id: { toString(): string };
      title?: string;
      username?: string | null;
      broadcast?: boolean;
    }> = [];
    for (const d of dialogs) {
      const e = d.entity as unknown as
        | (Record<string, unknown> & { broadcast?: boolean })
        | null;
      if (e && e.broadcast === true) {
        channelEntities.push(e as never);
      }
    }
    result.channelsScanned = channelEntities.length;

    for (let i = 0; i < channelEntities.length; i++) {
      if (i > 0) await sleep(SYNC_DELAY_MS);
      const channel = channelEntities[i];
      const channelIdRaw = channel.id.toString();
      const channelIdWithPrefix = channelIdRaw.startsWith("-100")
        ? channelIdRaw
        : `-100${channelIdRaw}`;

      // Lista admins do canal. Pode falhar se a conta MTProto não tiver
      // permissão (não é admin nem participante visível) — caímos fora.
      let participants: { users?: Array<Record<string, unknown>> };
      try {
        participants = (await client.invoke(
          new Api.channels.GetParticipants({
            channel: channel as never,
            filter: new Api.ChannelParticipantsAdmins(),
            offset: 0,
            limit: 100,
            hash: BigInt(0) as never,
          }),
        )) as never;
      } catch (err) {
        console.warn(
          `[mtproto-sync] Falha ao listar admins do canal ${channelIdRaw}: ${extractErrorMessage(err)}`,
        );
        continue;
      }

      const adminUsers = (participants.users ?? []) as Array<{
        bot?: boolean;
        username?: string | null;
        firstName?: string | null;
      }>;
      const adminBots = adminUsers.filter((u) => u.bot === true);

      for (const adminBot of adminBots) {
        const username = adminBot.username ?? null;
        if (!username) continue;

        const botRecord = await db.bot.findFirst({
          where: { username },
          select: { id: true, name: true, channelId: true },
        });

        if (!botRecord) {
          result.unknownBots += 1;
          result.items.push({
            botId: null,
            botName: adminBot.firstName ?? username,
            botUsername: username,
            channelId: channelIdWithPrefix,
            channelTitle: channel.title ?? null,
            action: "bot_unknown",
          });
          continue;
        }

        const previousChannelId = botRecord.channelId
          ? botRecord.channelId.toString()
          : null;

        if (previousChannelId === channelIdWithPrefix) {
          result.unchanged += 1;
          result.items.push({
            botId: botRecord.id,
            botName: botRecord.name,
            botUsername: username,
            channelId: channelIdWithPrefix,
            channelTitle: channel.title ?? null,
            action: "unchanged",
          });
          continue;
        }

        await db.bot.update({
          where: { id: botRecord.id },
          data: {
            channelId: BigInt(channelIdWithPrefix),
            channelTitle: channel.title ?? null,
            channelUsername: channel.username ?? null,
            channelLinkedAt: new Date(),
          },
        });

        if (previousChannelId === null) {
          result.linked += 1;
          result.items.push({
            botId: botRecord.id,
            botName: botRecord.name,
            botUsername: username,
            channelId: channelIdWithPrefix,
            channelTitle: channel.title ?? null,
            action: "linked",
          });
        } else {
          result.updated += 1;
          result.items.push({
            botId: botRecord.id,
            botName: botRecord.name,
            botUsername: username,
            channelId: channelIdWithPrefix,
            channelTitle: channel.title ?? null,
            action: "updated",
            previousChannelId,
          });
        }
      }
    }
  } finally {
    await safeDisconnect(client);
  }

  return result;
}

export interface ChannelMembershipItem {
  botId: string;
  botName: string;
  channelId: string;
  channelTitle: string | null;
  isMember: boolean;
}

/**
 * Lista todos os canais Telegram vinculados a bots da plataforma e
 * indica se o usuário MTProto conectado é membro de cada um.
 *
 * Estratégia: getDialogs no cliente MTProto pega canais/groups onde
 * o user está; cross-check com Bot.channelId. 1 round-trip pra
 * Telegram independente da quantidade de bots.
 *
 * Throws se a sessão MTProto não estiver conectada.
 */
export async function listMtprotoChannelMembership(): Promise<
  ChannelMembershipItem[]
> {
  const creds = await getConnectedCredentials();
  if (!creds) {
    throw new Error("Conta Telegram (MTProto) não está conectada");
  }

  const bots = await db.bot.findMany({
    where: { channelId: { not: null } },
    select: {
      id: true,
      name: true,
      channelId: true,
      channelTitle: true,
    },
  });
  if (bots.length === 0) return [];

  const client = buildClient(creds.apiId, creds.apiHash, creds.session);
  const memberIds = new Set<string>();
  try {
    await client.connect();
    // limit alto cobre contas com muitos canais; 500 é o teto prático.
    const dialogs = await client.getDialogs({ limit: 500 });
    for (const dialog of dialogs) {
      const entity = dialog.entity as { id?: { toString(): string } } | null;
      const id = entity?.id?.toString();
      if (id) {
        memberIds.add(id);
        // Canais retornam id positivo no MTProto (ex: 3936787998), mas
        // a Bot API usa o formato com prefixo -100 (-1003936787998).
        // Adicionamos as duas formas pra match robusto.
        memberIds.add(`-100${id}`);
      }
    }
  } finally {
    await safeDisconnect(client);
  }

  return bots.map((bot) => {
    const idStr = bot.channelId!.toString();
    const idPositive = idStr.startsWith("-100") ? idStr.slice(4) : idStr;
    const isMember =
      memberIds.has(idStr) || memberIds.has(idPositive);
    return {
      botId: bot.id,
      botName: bot.name,
      channelId: idStr,
      channelTitle: bot.channelTitle,
      isMember,
    };
  });
}

export type JoinChannelOutcome = "joined" | "already" | "failed" | "skipped";

export interface JoinAllChannelsItem {
  botId: string;
  botName: string;
  channelTitle: string | null;
  status: JoinChannelOutcome;
  error?: string;
}

export interface JoinAllChannelsResult {
  joined: number;
  already: number;
  failed: number;
  skipped: number;
  items: JoinAllChannelsItem[];
}

// Delay base entre joins consecutivos. Telegram limita ~20 joins/min;
// 10s mantém folga pra evitar FLOOD_WAIT já no primeiro lote.
const JOIN_DELAY_MS = 10_000;
// Margem extra adicionada ao FLOOD_WAIT_X retornado pelo Telegram, pra
// cobrir desync de relógio/jitter entre cliente e servidor.
const FLOOD_MARGIN_MS = 1_500;
// Limite máximo de espera por FLOOD num único bot. Se o servidor pedir
// mais que isso, marcamos como failed (admin reroda depois).
const FLOOD_MAX_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseFloodWaitSeconds(message: string): number | null {
  const m = message.match(/FLOOD[_ ]?WAIT[_ ]?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Adiciona o usuário MTProto como membro a TODOS os canais Telegram
 * vinculados a algum bot. Bots Telegram não conseguem invitar users,
 * então o fluxo é: bot cria invite link single-use; user MTProto
 * importa esse link via messages.ImportChatInvite.
 *
 * Idempotente: USER_ALREADY_PARTICIPANT vira status="already".
 * Anti-floodwait: 3s entre cada join.
 */
export async function joinAllBotChannels(): Promise<JoinAllChannelsResult> {
  const creds = await getConnectedCredentials();
  if (!creds) {
    throw new Error("Conta Telegram (MTProto) não está conectada");
  }

  // Carrega bots com channel vinculado.
  const bots = await db.bot.findMany({
    where: { channelId: { not: null } },
    select: {
      id: true,
      name: true,
      channelId: true,
      channelTitle: true,
      telegramToken: true,
    },
  });

  const result: JoinAllChannelsResult = {
    joined: 0,
    already: 0,
    failed: 0,
    skipped: 0,
    items: [],
  };
  if (bots.length === 0) return result;

  // Conecta o cliente MTProto uma vez só pra todos os joins.
  const client = buildClient(creds.apiId, creds.apiHash, creds.session);
  try {
    await client.connect();

    const { Bot: GrammyBot } = await import("grammy");
    for (let idx = 0; idx < bots.length; idx++) {
      const bot = bots[idx];
      if (idx > 0) await sleep(JOIN_DELAY_MS);

      const item: JoinAllChannelsItem = {
        botId: bot.id,
        botName: bot.name,
        channelTitle: bot.channelTitle,
        status: "skipped",
      };

      if (!bot.channelId) {
        result.skipped += 1;
        result.items.push(item);
        continue;
      }

      try {
        const token = decrypt(bot.telegramToken);
        const grammy = new GrammyBot(token);
        // Cria invite link novo, single-use, sem expiração curta.
        const link = await grammy.api.createChatInviteLink(
          Number(bot.channelId),
          { member_limit: 1 },
        );
        const hash = extractInviteHash(link.invite_link);
        if (!hash) {
          item.status = "failed";
          item.error = `Não consegui parsear hash de ${link.invite_link}`;
          result.failed += 1;
          result.items.push(item);
          continue;
        }

        // Tenta importar o invite. Se o Telegram retornar FLOOD_WAIT_X,
        // espera X segundos (até FLOOD_MAX_WAIT_MS) e tenta uma vez mais.
        let attempt = 0;
        let resolved = false;
        while (!resolved && attempt < 2) {
          try {
            await client.invoke(new Api.messages.ImportChatInvite({ hash }));
            item.status = "joined";
            result.joined += 1;
            resolved = true;
            break;
          } catch (err) {
            const message = extractErrorMessage(err);
            if (message.includes("USER_ALREADY_PARTICIPANT")) {
              item.status = "already";
              result.already += 1;
              resolved = true;
              break;
            }
            const waitSec = parseFloodWaitSeconds(message);
            if (waitSec !== null && attempt === 0) {
              const waitMs = waitSec * 1000 + FLOOD_MARGIN_MS;
              if (waitMs > FLOOD_MAX_WAIT_MS) {
                item.status = "failed";
                item.error = `${message} (espera ${waitSec}s > limite ${FLOOD_MAX_WAIT_MS / 1000}s — rode novamente depois)`;
                result.failed += 1;
                resolved = true;
                break;
              }
              await sleep(waitMs);
              attempt++;
              continue;
            }
            item.status = "failed";
            item.error = message;
            result.failed += 1;
            resolved = true;
            break;
          }
        }
      } catch (err) {
        item.status = "failed";
        item.error = extractErrorMessage(err);
        result.failed += 1;
      }
      result.items.push(item);
    }
  } finally {
    await safeDisconnect(client);
  }
  return result;
}

/**
 * Extrai o hash de um invite link no formato:
 * - https://t.me/+ABC123      → "ABC123"
 * - https://t.me/joinchat/ABC → "ABC"
 */
function extractInviteHash(url: string): string | null {
  const m1 = url.match(/t\.me\/\+([A-Za-z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/t\.me\/joinchat\/([A-Za-z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
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
