// Backfill idempotente do content de RecoveryMessage:
//   { text, mediaKey, mediaType }  →  { variants: [{...}], buttons: [] }
//
// Mensagens que já tem `variants` no content são puladas. Roda direto em
// SQL (Prisma raw) pra não depender da forma do JSON via client.

import { PrismaClient } from "@prisma/client";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL é obrigatória");
    process.exit(1);
  }

  const db = new PrismaClient();
  console.log("🔧 Backfill: RecoveryMessage.content → { variants[], buttons[] }");

  const messages = await db.recoveryMessage.findMany({
    select: { id: true, content: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const m of messages) {
    const c = m.content as Record<string, unknown> | null;
    if (!c) {
      skipped += 1;
      continue;
    }
    if (Array.isArray((c as Record<string, unknown>).variants)) {
      skipped += 1;
      continue;
    }

    // Wrappa o content antigo numa única variant.
    const newContent = {
      variants: [
        {
          text: typeof c.text === "string" ? c.text : "",
          mediaKey: c.mediaKey ?? null,
          mediaType: c.mediaType ?? null,
        },
      ],
      buttons: [],
    };

    await db.recoveryMessage.update({
      where: { id: m.id },
      data: { content: newContent },
    });
    migrated += 1;
  }

  console.log(`✅ Migration concluída: ${migrated} migrada(s), ${skipped} pulada(s)`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("❌ Migration falhou:", err);
  process.exit(1);
});
