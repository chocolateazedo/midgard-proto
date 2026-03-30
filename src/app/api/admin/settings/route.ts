import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { platformSettingsSchema } from "@/lib/validations";
import { encrypt, maskValue } from "@/lib/crypto";
import { invalidateStorageCache } from "@/lib/s3";
import { invalidatePixCache } from "@/lib/pix";

const ENCRYPTED_KEYS = new Set([
  "storage_access_key_id",
  "storage_secret_access_key",
  "pix_access_token",
  "pix_webhook_secret",
]);

function maskSettings(
  settings: Array<{ key: string; value: string; isEncrypted: boolean | null; [k: string]: unknown }>
) {
  return settings.map((s) => ({
    ...s,
    value: s.isEncrypted ? maskValue(s.value) : s.value,
  }));
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "owner" && session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const settings = await db.platformSetting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: maskSettings(settings),
    });
  } catch (error) {
    console.error("[GET /api/admin/settings] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "owner" && session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = platformSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", data: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { key, description } = parsed.data;
    let { value, isEncrypted } = parsed.data;

    // Auto-encrypt known sensitive keys if the caller did not opt-in explicitly
    if (ENCRYPTED_KEYS.has(key)) {
      isEncrypted = true;
    }

    // Only encrypt when the incoming value is not a masked placeholder
    const isMasked = /^\*{4}/.test(value);
    if (isEncrypted && !isMasked) {
      value = encrypt(value);
    }

    const existing = await db.platformSetting.findFirst({
      where: { key },
    });

    if (existing) {
      // If caller sent a masked value, keep the stored encrypted value unchanged
      const storedValue = isMasked && isEncrypted ? existing.value : value;

      const updated = await db.platformSetting.update({
        where: { id: existing.id },
        data: {
          value: storedValue,
          isEncrypted,
          description: description ?? null,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      });

      invalidateCaches(key);

      return NextResponse.json({
        success: true,
        data: { ...updated, value: updated.isEncrypted ? maskValue(updated.value) : updated.value },
      });
    }

    const created = await db.platformSetting.create({
      data: {
        key,
        value,
        isEncrypted: isEncrypted ?? false,
        description: description ?? null,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      },
    });

    invalidateCaches(key);

    return NextResponse.json(
      {
        success: true,
        data: {
          ...created,
          value: created.isEncrypted ? maskValue(created.value) : created.value,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/admin/settings] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

function invalidateCaches(key: string): void {
  if (key.startsWith("storage_")) {
    invalidateStorageCache();
  }
  if (key.startsWith("pix_")) {
    invalidatePixCache();
  }
}
