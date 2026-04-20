import { timingSafeEqual } from "crypto";

import { db } from "@/lib/db";

type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function verifyIntegrationBearer(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }
  const provided = header.slice(7).trim();
  if (!provided) {
    return { ok: false, status: 401, error: "Empty bearer token" };
  }

  const stored = await db.platformSetting.findUnique({
    where: { key: "integration_secret" },
  });
  if (!stored?.value) {
    return { ok: false, status: 503, error: "Integration secret not configured" };
  }

  const expected = stored.value;
  // timingSafeEqual exige buffers do mesmo tamanho — pad com zero no menor
  const maxLen = Math.max(expected.length, provided.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  a.write(expected);
  b.write(provided);
  const equal = timingSafeEqual(a, b) && expected.length === provided.length;
  if (!equal) {
    return { ok: false, status: 403, error: "Invalid bearer token" };
  }
  return { ok: true };
}
