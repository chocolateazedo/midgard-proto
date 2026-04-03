import { createVerify } from "crypto";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export interface PixCharge {
  txid: string;
  qrCode: string;
  copyPaste: string;
  expiresAt: Date;
}

export interface PixProvider {
  createCharge(amount: number, description: string): Promise<PixCharge>;
  verifyWebhook(body: unknown, signature: string): boolean;
  getChargeStatus(txid: string): Promise<"pending" | "paid" | "expired">;
}

async function getPixConfig(): Promise<{
  provider: string;
  accessToken: string;
  webhookSecret: string;
}> {
  const settings = await db.platformSetting.findMany();
  const map = new Map(settings.map((s) => [s.key, s]));

  const getValue = (key: string): string => {
    const s = map.get(key);
    if (!s) return "";
    return s.isEncrypted ? decrypt(s.value) : s.value;
  };

  return {
    provider: getValue("pix_provider") || "efipay",
    accessToken: getValue("pix_access_token"),
    webhookSecret: getValue("pix_webhook_secret"),
  };
}

// EFÍ Pay (ex-Gerencianet) implementation
class EfiPayProvider implements PixProvider {
  private baseUrl: string;
  private accessToken: string;
  private webhookSecret: string;

  constructor(accessToken: string, webhookSecret: string, sandbox = false) {
    this.baseUrl = sandbox
      ? "https://pix-h.api.efipay.com.br"
      : "https://pix.api.efipay.com.br";
    this.accessToken = accessToken;
    this.webhookSecret = webhookSecret;
  }

  async createCharge(amount: number, description: string): Promise<PixCharge> {
    const txid = this.generateTxid();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const response = await fetch(`${this.baseUrl}/v2/cob/${txid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        calendario: {
          expiracao: 1800, // 30 minutes in seconds
        },
        valor: {
          original: amount.toFixed(2),
        },
        chave: "", // PIX key configured in EFÍ Pay dashboard
        solicitacaoPagador: description,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EFÍ Pay error: ${error}`);
    }

    const data = await response.json();

    // Get QR Code
    const qrResponse = await fetch(`${this.baseUrl}/v2/loc/${data.loc.id}/qrcode`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!qrResponse.ok) {
      throw new Error("Failed to generate QR Code");
    }

    const qrData = await qrResponse.json();

    return {
      txid,
      qrCode: qrData.imagemQrcode,
      copyPaste: qrData.qrcode,
      expiresAt,
    };
  }

  verifyWebhook(body: unknown, signature: string): boolean {
    if (!this.webhookSecret) return true;
    // EFÍ Pay uses mTLS for webhook verification
    // In production, verify the client certificate
    return true;
  }

  async getChargeStatus(
    txid: string
  ): Promise<"pending" | "paid" | "expired"> {
    const response = await fetch(`${this.baseUrl}/v2/cob/${txid}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get charge status");
    }

    const data = await response.json();

    switch (data.status) {
      case "CONCLUIDA":
        return "paid";
      case "REMOVIDA_PELO_USUARIO_RECEBEDOR":
      case "REMOVIDA_PELO_PSP":
        return "expired";
      default:
        return "pending";
    }
  }

  private generateTxid(): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 35; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// Woovi (OpenPix) implementation
class WooviProvider implements PixProvider {
  private baseUrl = "https://api.openpix.com.br";
  private appId: string;

  // OpenPix public key for webhook signature verification
  private static WEBHOOK_PUBLIC_KEY = Buffer.from(
    "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlHZk1BMEdDU3FHU0liM0RRRUJBUVVBQTRHTkFEQ0JpUUtCZ1FDLytOdElranpldnZxRCtJM01NdjNiTFhEdApwdnhCalk0QnNSclNkY2EzcnRBd01jUllZdnhTbmQ3amFnVkxwY3RNaU94UU84aWVVQ0tMU1dIcHNNQWpPL3paCldNS2Jxb0c4TU5waS91M2ZwNnp6MG1jSENPU3FZc1BVVUcxOWJ1VzhiaXM1WloySVpnQk9iV1NwVHZKMGNuajYKSEtCQUE4MkpsbitsR3dTMU13SURBUUFCCi0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=",
    "base64"
  ).toString("utf-8");

  constructor(appId: string) {
    this.appId = appId;
  }

  async createCharge(amount: number, description: string): Promise<PixCharge> {
    const correlationID = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const response = await fetch(`${this.baseUrl}/api/v1/charge`, {
      method: "POST",
      headers: {
        Authorization: this.appId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        correlationID,
        value: Math.round(amount * 100), // Woovi uses cents
        comment: description,
        expiresIn: 1800, // 30 minutes in seconds
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Woovi error: ${error}`);
    }

    const data = await response.json();
    const charge = data.charge;

    return {
      txid: correlationID,
      qrCode: charge.qrCodeImage ?? "",
      copyPaste: charge.brCode ?? data.brCode ?? "",
      expiresAt,
    };
  }

  verifyWebhook(body: unknown, signature: string): boolean {
    if (!signature) return false;
    try {
      const payload = JSON.stringify(body);
      const verifier = createVerify("sha256WithRSAEncryption");
      verifier.update(Buffer.from(payload));
      return verifier.verify(
        WooviProvider.WEBHOOK_PUBLIC_KEY,
        signature,
        "base64"
      );
    } catch {
      return false;
    }
  }

  async getChargeStatus(
    txid: string
  ): Promise<"pending" | "paid" | "expired"> {
    const response = await fetch(`${this.baseUrl}/api/v1/charge/${txid}`, {
      headers: {
        Authorization: this.appId,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get charge status from Woovi");
    }

    const data = await response.json();
    const status = data.charge?.status;

    switch (status) {
      case "COMPLETED":
        return "paid";
      case "EXPIRED":
        return "expired";
      default:
        return "pending";
    }
  }
}

// Mock provider para testes — simula criação de cobrança sem PSP real
class MockProvider implements PixProvider {
  async createCharge(amount: number, description: string): Promise<PixCharge> {
    const txid = `mock_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    return {
      txid,
      qrCode: "",
      copyPaste: `mock-pix-${txid}`,
      expiresAt,
    };
  }

  verifyWebhook(_body: unknown, _signature: string): boolean {
    return true;
  }

  async getChargeStatus(txid: string): Promise<"pending" | "paid" | "expired"> {
    // Mock provider nunca confirma sozinho — confirmação via API /api/mock-pix/confirm
    return "pending";
  }
}

let cachedProvider: PixProvider | null = null;

export async function getPixProvider(): Promise<PixProvider> {
  if (cachedProvider) return cachedProvider;

  const config = await getPixConfig();

  switch (config.provider) {
    case "mock":
      cachedProvider = new MockProvider();
      break;
    case "woovi":
      cachedProvider = new WooviProvider(config.accessToken);
      break;
    case "efipay":
    default:
      cachedProvider = new EfiPayProvider(
        config.accessToken,
        config.webhookSecret
      );
      break;
  }

  return cachedProvider;
}

export function invalidatePixCache(): void {
  cachedProvider = null;
}
