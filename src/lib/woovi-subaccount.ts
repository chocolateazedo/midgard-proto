// Wrapper da API de Subcontas da Woovi/OpenPix.
//
// Referências:
// - https://developers.woovi.com/en/docs/category/subaccount
// - https://developers.woovi.com/en/docs/charge/how-to-create-charge-with-split-to-subbaccount-using-api
//
// A plataforma tem UMA conta-mãe na Woovi. Cada creator/manager vira uma
// subconta identificada pela própria chave Pix. Os splits em cobranças
// acumulam saldo na subconta (virtual); o saque vai do saldo da subconta
// pra chave Pix registrada.
//
// Auth: mesmo AppID do provider padrão (config em platform_settings sob a
// chave `pix_access_token`, quando `pix_provider=woovi`). Se o provider
// configurado for outro, operações de subconta falham com motivo claro.

import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

const WOOVI_BASE_URL = "https://api.openpix.com.br";

export type SubAccountResult<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: WooviErrorCode; message: string };

export type WooviErrorCode =
  | "PROVIDER_NOT_WOOVI"
  | "APP_ID_MISSING"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "NETWORK";

export interface WooviSubAccount {
  name: string;
  pixKey: string;
  balance?: number;
}

async function getWooviAppId(): Promise<SubAccountResult<string>> {
  const settings = await db.platformSetting.findMany({
    where: { key: { in: ["pix_provider", "pix_access_token"] } },
  });
  const map = new Map(settings.map((s) => [s.key, s]));
  const providerSetting = map.get("pix_provider");
  const provider = providerSetting?.value ?? "efipay";
  if (provider !== "woovi") {
    return {
      ok: false,
      errorCode: "PROVIDER_NOT_WOOVI",
      message:
        "Split Pix exige provider=woovi. Configure em /admin/settings antes de provisionar subcontas.",
    };
  }
  const tokenSetting = map.get("pix_access_token");
  if (!tokenSetting || !tokenSetting.value) {
    return {
      ok: false,
      errorCode: "APP_ID_MISSING",
      message: "AppID da Woovi não configurado em /admin/settings.",
    };
  }
  const appId = tokenSetting.isEncrypted
    ? decrypt(tokenSetting.value)
    : tokenSetting.value;
  return { ok: true, data: appId };
}

/**
 * Cria uma subconta na Woovi. Idempotente do lado da Woovi: chamar
 * novamente com a mesma `pixKey` retorna erro que é interpretado como
 * "já existe" e tratado como sucesso (ver callers).
 */
export async function createWooviSubAccount(input: {
  name: string;
  pixKey: string;
}): Promise<SubAccountResult<WooviSubAccount>> {
  const appId = await getWooviAppId();
  if (!appId.ok) return appId;

  let res: Response;
  try {
    res = await fetch(`${WOOVI_BASE_URL}/api/v1/subaccount`, {
      method: "POST",
      headers: {
        Authorization: appId.data,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: input.name, pixKey: input.pixKey }),
    });
  } catch (e) {
    return {
      ok: false,
      errorCode: "NETWORK",
      message: e instanceof Error ? e.message : "Falha de rede ao criar subconta",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      errorCode: "HTTP_ERROR",
      message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: "Resposta da Woovi não é JSON válido",
    };
  }

  // Formato esperado (list/get): { subAccount: { name, pixKey, balance } }
  // ou o objeto direto. Defensivo: aceita ambos.
  const raw = data as Record<string, unknown>;
  const sub = (raw.subAccount ?? raw.SubAccount ?? raw) as Record<string, unknown>;
  const name = typeof sub.name === "string" ? sub.name : null;
  const pixKey = typeof sub.pixKey === "string" ? sub.pixKey : null;
  if (!name || !pixKey) {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: `Resposta sem campos esperados (name/pixKey): ${JSON.stringify(data).slice(0, 300)}`,
    };
  }

  return {
    ok: true,
    data: {
      name,
      pixKey,
      balance: typeof sub.balance === "number" ? sub.balance : undefined,
    },
  };
}

/**
 * Consulta subconta pela chave Pix. Útil pra detectar se já existe antes
 * de tentar criar (fluxo idempotente no worker).
 */
export async function getWooviSubAccount(
  pixKey: string
): Promise<SubAccountResult<WooviSubAccount>> {
  const appId = await getWooviAppId();
  if (!appId.ok) return appId;

  let res: Response;
  try {
    res = await fetch(
      `${WOOVI_BASE_URL}/api/v1/subaccount/${encodeURIComponent(pixKey)}`,
      {
        method: "GET",
        headers: { Authorization: appId.data },
      }
    );
  } catch (e) {
    return {
      ok: false,
      errorCode: "NETWORK",
      message: e instanceof Error ? e.message : "Falha de rede ao consultar subconta",
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      errorCode: "HTTP_ERROR",
      message: "Subconta não encontrada",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      errorCode: "HTTP_ERROR",
      message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: "Resposta não é JSON válido",
    };
  }

  const raw = data as Record<string, unknown>;
  const sub = (raw.subAccount ?? raw.SubAccount ?? raw) as Record<string, unknown>;
  const name = typeof sub.name === "string" ? sub.name : null;
  const key = typeof sub.pixKey === "string" ? sub.pixKey : null;
  if (!name || !key) {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: `Resposta sem campos esperados: ${JSON.stringify(data).slice(0, 300)}`,
    };
  }
  return {
    ok: true,
    data: {
      name,
      pixKey: key,
      balance: typeof sub.balance === "number" ? sub.balance : undefined,
    },
  };
}

/**
 * Consulta só o saldo (em centavos) da subconta.
 * Derivado de getWooviSubAccount pra manter interface coerente.
 */
export async function getWooviSubAccountBalance(
  pixKey: string
): Promise<SubAccountResult<{ balanceCents: number }>> {
  const sub = await getWooviSubAccount(pixKey);
  if (!sub.ok) return sub;
  if (typeof sub.data.balance !== "number") {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: "Resposta da Woovi sem campo balance",
    };
  }
  return { ok: true, data: { balanceCents: sub.data.balance } };
}

export interface WooviWithdrawResult {
  correlationID: string;
  status: string;
  valueCents: number;
}

/**
 * Solicita saque do saldo da subconta para a chave Pix registrada nela.
 * Valor sacado = saldo total disponível no momento (comportamento da Woovi).
 * Retorna o correlationID do movement — pode ser usado para rastrear via
 * webhook OPENPIX:MOVEMENT_FAILED.
 */
export async function withdrawFromWooviSubAccount(input: {
  pixKey: string;
  correlationID: string;
}): Promise<SubAccountResult<WooviWithdrawResult>> {
  const appId = await getWooviAppId();
  if (!appId.ok) return appId;

  let res: Response;
  try {
    res = await fetch(
      `${WOOVI_BASE_URL}/api/v1/subaccount/${encodeURIComponent(input.pixKey)}/withdraw`,
      {
        method: "POST",
        headers: {
          Authorization: appId.data,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ correlationID: input.correlationID }),
      }
    );
  } catch (e) {
    return {
      ok: false,
      errorCode: "NETWORK",
      message: e instanceof Error ? e.message : "Falha de rede ao solicitar saque",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      errorCode: "HTTP_ERROR",
      message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: "Resposta da Woovi não é JSON válido",
    };
  }

  // Resposta esperada: { withdraw: { transaction: {...} } } ou variantes.
  const raw = data as Record<string, unknown>;
  const w = (raw.withdraw ?? raw.transaction ?? raw) as Record<string, unknown>;
  const inner = (w.transaction ?? w) as Record<string, unknown>;
  const corr =
    typeof inner.correlationID === "string"
      ? inner.correlationID
      : input.correlationID;
  const status = typeof inner.status === "string" ? inner.status : "CREATED";
  const value =
    typeof inner.value === "number"
      ? inner.value
      : typeof (inner as { amount?: unknown }).amount === "number"
      ? (inner as { amount: number }).amount
      : 0;

  return {
    ok: true,
    data: { correlationID: corr, status, valueCents: value },
  };
}

/**
 * Lista as chaves Pix da conta principal da empresa Woovi.
 * GET /api/v1/pix-keys
 *
 * Usado pra auto-detectar a chave Pix da conta principal (com isDefault=true)
 * pra usar como destino da transferência de taxa de saque.
 */
export interface WooviCompanyPixKey {
  key: string;
  type: string;
  isDefault: boolean;
}

export async function listWooviCompanyPixKeys(): Promise<
  SubAccountResult<WooviCompanyPixKey[]>
> {
  const appId = await getWooviAppId();
  if (!appId.ok) return appId;

  let res: Response;
  try {
    res = await fetch(`${WOOVI_BASE_URL}/api/v1/pix-keys`, {
      method: "GET",
      headers: {
        Authorization: appId.data,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      errorCode: "NETWORK",
      message: e instanceof Error ? e.message : "Falha de rede",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      errorCode: "HTTP_ERROR",
      message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: "Resposta da Woovi não é JSON válido",
    };
  }

  // Schema esperado: { pixKeys: [{ key, type, isDefault, ... }] } ou similares.
  const raw = data as Record<string, unknown>;
  const arr =
    (raw.pixKeys as unknown[]) ??
    (raw.keys as unknown[]) ??
    (raw.data as unknown[]) ??
    (Array.isArray(data) ? (data as unknown[]) : []);
  if (!Array.isArray(arr)) {
    return {
      ok: false,
      errorCode: "INVALID_RESPONSE",
      message: "Lista de chaves Pix não retornada pela Woovi",
    };
  }
  const keys: WooviCompanyPixKey[] = arr
    .map((item) => {
      const r = item as Record<string, unknown>;
      return {
        key: typeof r.key === "string" ? r.key : "",
        type: typeof r.type === "string" ? r.type : "",
        isDefault: r.isDefault === true,
      };
    })
    .filter((k) => k.key.length > 0);

  return { ok: true, data: keys };
}

/**
 * Transferência entre subcontas da mesma empresa Woovi.
 * POST /api/v1/subaccount/transfer
 *
 * Usado pra cobrar taxa de saque: move da subconta do creator pra
 * subconta da plataforma (configurada em platform_settings.woovi_main_pix_key).
 *
 * pixKeyType aceita: EMAIL | CPF | CNPJ | PHONE | RANDOM
 */
export async function transferBetweenWooviSubAccounts(input: {
  fromPixKey: string;
  fromPixKeyType: string;
  toPixKey: string;
  toPixKeyType: string;
  valueCents: number;
  correlationID: string;
}): Promise<SubAccountResult<{ correlationID: string }>> {
  const appId = await getWooviAppId();
  if (!appId.ok) return appId;

  let res: Response;
  try {
    res = await fetch(`${WOOVI_BASE_URL}/api/v1/subaccount/transfer`, {
      method: "POST",
      headers: {
        Authorization: appId.data,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        value: input.valueCents,
        fromPixKey: input.fromPixKey,
        fromPixKeyType: input.fromPixKeyType,
        toPixKey: input.toPixKey,
        toPixKeyType: input.toPixKeyType,
        correlationID: input.correlationID,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      errorCode: "NETWORK",
      message: e instanceof Error ? e.message : "Falha de rede ao transferir",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      errorCode: "HTTP_ERROR",
      message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  return { ok: true, data: { correlationID: input.correlationID } };
}
