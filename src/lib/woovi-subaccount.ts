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
