# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BotFlow** — multi-tenant SaaS platform where creators manage Telegram bots to sell digital content (images, videos, files) with Pix paywall. Built with Next.js 14 App Router, Prisma ORM, and PostgreSQL.

## Commands

```bash
# Dev
pnpm dev                    # Start Next.js dev server (port 3000)
pnpm build                  # Build (runs prisma generate first)
pnpm lint                   # ESLint

# Database
docker-compose up -d        # Start PostgreSQL + Redis
pnpm db:generate            # Generate Prisma client
pnpm db:migrate             # Run migrations (dev)
pnpm db:push                # Push schema directly (no migration)
pnpm db:studio              # Open Prisma Studio
pnpm db:seed                # Seed owner user + platform settings (tsx scripts/seed.ts)

# Workers
pnpm workers                # Start BullMQ workers (pix-confirmation, content-delivery, preview-generation)
```

## Architecture

**ORM:** Prisma (not Drizzle as originally planned). Schema at `prisma/schema.prisma`. DB client singleton at `src/lib/db/index.ts` exports `db`.

**Auth:** NextAuth.js v5 with credentials provider (bcryptjs). Config split between `src/lib/auth.ts` (full config with provider) and `src/lib/auth.config.ts` (edge-compatible config for middleware). JWT includes `id`, `email`, `name`, `role`, `mustChangePassword`.

**Roles:** `owner` (single, created via seed), `admin`, `creator`. Middleware at `src/middleware.ts` enforces: `/dashboard/*` requires auth, `/admin/*` requires owner/admin.

**Key lib modules:**
- `src/lib/s3.ts` — S3/Wasabi client, reads config from `platform_settings` table with in-memory cache (5min TTL). Presigned URL generation for uploads/downloads.
- `src/lib/telegram.ts` — BotManager singleton managing grammy bot instances. Webhooks at `/api/webhooks/telegram/[botId]`.
- `src/lib/pix.ts` — Pix payment provider abstraction (EFI Pay default). Interface `PixProvider` for swappable PSPs.
- `src/lib/crypto.ts` — AES-256-GCM encryption for sensitive platform_settings values. Uses `ENCRYPTION_SECRET` env var.
- `src/lib/queue.ts` — BullMQ setup with Redis.
- `src/lib/preview.ts` — Sharp (blur images) + fluent-ffmpeg (video thumbnails) for preview generation.

**Data flow patterns:**
- Server Actions in `src/server/actions/` return `{ success, data?, error? }`.
- Reusable queries in `src/server/queries/`.
- API routes follow same response pattern with appropriate HTTP status codes.
- File uploads use presigned URLs (browser uploads directly to S3/Wasabi).

**Background workers** (`src/workers/`): Process Pix confirmations, deliver content to Telegram users after payment, generate blurred previews after upload.

**Sale flow:** Telegram user -> /catalog -> inline buy button -> Pix QR code generated -> PSP webhook confirms payment -> BullMQ job delivers original file via Telegram bot.

## UI Stack

Tailwind CSS + shadcn/ui components (`src/components/ui/`). Dark mode default via next-themes. Recharts for charts. TanStack Table for data tables. React Hook Form + Zod for form validation. Sonner for toasts. Lucide React for icons.

**Layout:** Sidebar (collapsible, 240px/64px) + header with breadcrumbs. Separate layouts for dashboard (`src/app/dashboard/layout.tsx`) and admin (`src/app/admin/layout.tsx`).

## Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json).

## Sensitive Config

Platform settings stored in `platform_settings` table. Sensitive values (API keys, tokens) encrypted with AES-256-GCM before storage. Never return decrypted values to frontend — mask with `****`.

## Idioma

Todo novo código deve usar **português brasileiro**: comentários, mensagens de erro, textos de UI, logs, nomes de variáveis descritivas em strings, e documentação. Nomes de variáveis, funções e classes continuam em inglês (padrão da linguagem). O código existente não precisa ser alterado.
