// Migração one-shot pra introduzir o novo modelo de Content:
//   - enum ContentAvailability (available | inactive)
//   - coluna availability (default available)
//   - coluna sent_to_channel_at (suprime re-broadcast em massa)
//   - drop is_published (state antigo, mapeado pra availability)
//
// Idempotente: pode rodar mais de uma vez.
//
// Sequência de SQL puro porque o Prisma db:push não suporta backfill
// nem ordem (se rodasse db:push --accept-data-loss antes do backfill,
// is_published seria descartado e perderíamos a info).

import { PrismaClient } from "@prisma/client";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL é obrigatória");
    process.exit(1);
  }

  const db = new PrismaClient();
  console.log("🔧 Migrando modelo Content (availability + sent_to_channel_at)...");

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ContentAvailability" AS ENUM ('available', 'inactive');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    ALTER TABLE content
      ADD COLUMN IF NOT EXISTS availability "ContentAvailability" NOT NULL DEFAULT 'available',
      ADD COLUMN IF NOT EXISTS sent_to_channel_at TIMESTAMP(3) NULL
  `);

  // Backfill 1: mapear is_published → availability (se a coluna ainda existe).
  const hasIsPublished = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'content' AND column_name = 'is_published'
    ) AS exists
  `);
  if (hasIsPublished[0]?.exists) {
    const r1 = await db.$executeRawUnsafe(`
      UPDATE content
      SET availability = CASE WHEN is_published THEN 'available'::"ContentAvailability" ELSE 'inactive'::"ContentAvailability" END
    `);
    console.log(`  ✓ availability backfilled (${r1} rows)`);
  } else {
    console.log("  • is_published não existe — backfill availability já feito");
  }

  // Backfill 2: sent_to_channel_at = published_at (suprime re-broadcast).
  const r2 = await db.$executeRawUnsafe(`
    UPDATE content
    SET sent_to_channel_at = published_at
    WHERE published_at IS NOT NULL AND sent_to_channel_at IS NULL
  `);
  console.log(`  ✓ sent_to_channel_at backfilled (${r2} rows)`);

  // Backfill 3: conteúdo gratuito (price=0) com deliveryMode=ondemand vira catalog (assinante).
  const r3 = await db.$executeRawUnsafe(`
    UPDATE content
    SET delivery_mode = 'catalog'
    WHERE delivery_mode = 'ondemand' AND price = 0
  `);
  console.log(`  ✓ free ondemand → catalog (${r3} rows)`);

  // Drop is_published se ainda existe (depois do backfill).
  if (hasIsPublished[0]?.exists) {
    await db.$executeRawUnsafe(`ALTER TABLE content DROP COLUMN IF EXISTS is_published`);
    console.log("  ✓ is_published dropped");
  }

  // Garante o índice composto novo (matching schema.prisma).
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "content_bot_id_delivery_mode_availability_idx"
    ON content (bot_id, delivery_mode, availability)
  `);
  console.log("  ✓ índice (bot_id, delivery_mode, availability) garantido");

  console.log("✅ Migração concluída");
  await db.$disconnect();
}

main().catch((err) => {
  console.error("❌ Migração falhou:", err);
  process.exit(1);
});
