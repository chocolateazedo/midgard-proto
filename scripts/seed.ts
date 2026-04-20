import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL is required");
    process.exit(1);
  }

  const db = new PrismaClient();

  console.log("🌱 Starting seed...");

  // Create owner user
  const email = process.env.SEED_OWNER_EMAIL || "admin@botfans.com";
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME || "Admin";

  if (!password) {
    console.error("❌ SEED_OWNER_PASSWORD is required");
    process.exit(1);
  }

  const existingUser = await db.user.findFirst({
    where: { email },
  });

  if (!existingUser) {
    const passwordHash = await hash(password, 12);
    await db.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "owner",
        isActive: true,
      },
    });
    console.log(`  ✓ Owner user created: ${email}`);
  } else {
    console.log(`  ⏭ Owner user already exists: ${email}`);
  }

  // Create default platform settings
  const defaultSettings = [
    {
      key: "storage_provider",
      value: process.env.DEFAULT_STORAGE_PROVIDER || "s3",
      description: "Storage provider (s3 or wasabi)",
    },
    {
      key: "storage_bucket",
      value: process.env.DEFAULT_STORAGE_BUCKET || "",
      description: "S3/Wasabi bucket name",
    },
    {
      key: "storage_region",
      value: process.env.DEFAULT_STORAGE_REGION || "us-east-1",
      description: "Storage region",
    },
    {
      key: "storage_endpoint",
      value: process.env.DEFAULT_STORAGE_ENDPOINT || "",
      description: "Custom S3 endpoint (for Wasabi)",
    },
    {
      key: "storage_access_key_id",
      value: process.env.DEFAULT_STORAGE_ACCESS_KEY_ID || "",
      description: "Storage access key ID",
      isEncrypted: false, // Will be encrypted when set via admin panel
    },
    {
      key: "storage_secret_access_key",
      value: process.env.DEFAULT_STORAGE_SECRET_ACCESS_KEY || "",
      description: "Storage secret access key",
      isEncrypted: false,
    },
    {
      key: "platform_fee_percent",
      value: "10.00",
      description: "Default platform fee percentage",
    },
    {
      key: "platform_name",
      value: "BotFans",
      description: "Platform display name",
    },
    {
      key: "platform_base_url",
      value: process.env.NEXTAUTH_URL || "http://localhost:3000",
      description: "Platform base URL for webhooks",
    },
    {
      key: "telegram_default_welcome_message",
      value:
        "Bem-vindo! 🎉\n\nAqui você encontra conteúdo exclusivo.\n\nUse /catalog para ver o que está disponível.",
      description: "Default Telegram bot welcome message",
    },
    {
      key: "telegram_webhook_base_url",
      value: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/webhooks/telegram`,
      description: "Base URL for Telegram webhooks",
    },
    {
      key: "pix_provider",
      value: "efipay",
      description: "Pix payment provider",
    },
    {
      key: "pix_access_token",
      value: "",
      description: "Pix provider access token",
      isEncrypted: false,
    },
    {
      key: "pix_webhook_secret",
      value: "",
      description: "Pix webhook verification secret",
      isEncrypted: false,
    },
    {
      key: "telegram_api_id",
      value: "",
      description: "Telegram api_id (my.telegram.org) da conta usada para criar bots via BotFather",
    },
    {
      key: "telegram_api_hash",
      value: "",
      description: "Telegram api_hash (my.telegram.org)",
      isEncrypted: false,
    },
    {
      key: "telegram_phone",
      value: "",
      description: "Telefone da conta Telegram usada pra automação (E.164)",
    },
    {
      key: "telegram_session",
      value: "",
      description: "StringSession gramjs criptografada — populada após login OTP",
      isEncrypted: false,
    },
    {
      key: "telegram_me",
      value: "",
      description: "Cache de {id, username, firstName} da conta Telegram conectada",
    },
    {
      key: "integration_secret",
      value: "",
      description: "Shared secret para autenticação do endpoint /api/integrations/provision-bot (Bearer)",
      isEncrypted: false,
    },
    {
      key: "bot_provisioning_max_per_hour",
      value: "12",
      description: "Limite de bots criados por hora via endpoint de integração",
    },
  ];

  for (const setting of defaultSettings) {
    const existing = await db.platformSetting.findFirst({
      where: { key: setting.key },
    });

    if (!existing) {
      await db.platformSetting.create({
        data: {
          key: setting.key,
          value: setting.value,
          description: setting.description,
          isEncrypted: setting.isEncrypted ?? false,
        },
      });
      console.log(`  ✓ Setting created: ${setting.key}`);
    } else {
      console.log(`  ⏭ Setting already exists: ${setting.key}`);
    }
  }

  console.log("\n✅ Seed completed!");
  await db.$disconnect();
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
