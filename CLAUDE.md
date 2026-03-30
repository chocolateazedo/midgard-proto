# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Top Fans Telegram — project details to be added as the codebase develops.

# Prompt para Claude Code — Plataforma SaaS de Monetização via Telegram Bots

---

## Contexto Geral

Você vai construir uma plataforma SaaS completa chamada **BotFlow** — um sistema multi-tenant que permite creators criarem e gerenciarem bots do Telegram para vender conteúdo digital (imagens, vídeos, arquivos) com paywall por Pix, usando preview antes do pagamento.

A aplicação é **fullstack Node.js com SSR**, painel administrativo completo, gestão de usuários com roles, integração com S3/Wasabi, e configuração de bots Telegram totalmente gerenciada via painel.

---

## Stack Técnica Obrigatória

- **Runtime:** Node.js 20+
- **Framework Web:** Next.js 14+ (App Router, SSR)
- **Linguagem:** TypeScript (strict mode)
- **Banco de Dados:** PostgreSQL com Drizzle ORM
- **Autenticação:** NextAuth.js v5 (Auth.js) com credentials provider + JWT
- **Object Storage:** AWS S3 SDK v3 (compatível com Wasabi via endpoint customizado)
- **Upload de Arquivos:** Presigned URLs (upload direto do browser para o bucket)
- **Estilização:** Tailwind CSS + shadcn/ui
- **Validação:** Zod
- **Gerenciador de Pacotes:** pnpm
- **Migrations:** Drizzle Kit
- **Background Jobs:** BullMQ com Redis (para processar webhooks Pix e liberação de conteúdo)
- **Telegram Bot:** grammy (biblioteca Node.js para Telegram Bot API)
- **Image Processing:** Sharp (geração de previews borrados)
- **Video Thumbnails:** fluent-ffmpeg (thumbnail de vídeos)
- **Email:** Resend (notificações opcionais)
- **Variáveis de Ambiente:** dotenv + validação com Zod

---

## Estrutura de Pastas

```
botflow/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx            # Layout do creator dashboard
│   │   │   ├── page.tsx              # Overview / home do creator
│   │   │   ├── bots/
│   │   │   │   ├── page.tsx          # Lista de bots do creator
│   │   │   │   ├── new/page.tsx      # Criar novo bot
│   │   │   │   └── [botId]/
│   │   │   │       ├── page.tsx      # Overview do bot
│   │   │   │       ├── content/page.tsx   # Gerenciar conteúdo
│   │   │   │       ├── subscribers/page.tsx
│   │   │   │       └── settings/page.tsx
│   │   │   ├── earnings/page.tsx     # Ganhos do creator
│   │   │   └── settings/page.tsx     # Configurações da conta
│   │   ├── (admin)/
│   │   │   ├── layout.tsx            # Layout do admin panel
│   │   │   ├── page.tsx              # Dashboard global admin
│   │   │   ├── users/
│   │   │   │   ├── page.tsx          # Lista todos os usuários
│   │   │   │   └── [userId]/page.tsx
│   │   │   ├── bots/page.tsx         # Todos os bots da plataforma
│   │   │   ├── earnings/page.tsx     # Receita global
│   │   │   └── settings/
│   │   │       ├── page.tsx          # Configurações da plataforma
│   │   │       ├── storage/page.tsx  # Config S3/Wasabi
│   │   │       └── telegram/page.tsx # Config padrão Telegram
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── webhooks/
│   │       │   ├── pix/route.ts
│   │       │   └── telegram/[botId]/route.ts
│   │       ├── bots/
│   │       │   ├── route.ts
│   │       │   └── [botId]/
│   │       │       ├── route.ts
│   │       │       ├── content/route.ts
│   │       │       └── start/route.ts
│   │       ├── content/
│   │       │   ├── presigned-url/route.ts
│   │       │   └── [contentId]/route.ts
│   │       ├── admin/
│   │       │   ├── users/route.ts
│   │       │   ├── settings/route.ts
│   │       │   └── earnings/route.ts
│   │       └── upload/presigned/route.ts
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── dashboard/                # Componentes do creator dashboard
│   │   ├── admin/                    # Componentes do admin panel
│   │   └── shared/                   # Componentes compartilhados
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts              # Conexão Drizzle
│   │   │   ├── schema.ts             # Schema completo
│   │   │   └── migrations/
│   │   ├── auth.ts                   # Config NextAuth
│   │   ├── s3.ts                     # Cliente S3/Wasabi dinâmico
│   │   ├── telegram.ts               # Gerenciador de bots grammy
│   │   ├── queue.ts                  # BullMQ setup
│   │   ├── preview.ts                # Geração de previews
│   │   └── validations.ts            # Schemas Zod
│   ├── server/
│   │   ├── actions/                  # Server Actions Next.js
│   │   │   ├── auth.actions.ts
│   │   │   ├── bot.actions.ts
│   │   │   ├── content.actions.ts
│   │   │   ├── admin.actions.ts
│   │   │   └── settings.actions.ts
│   │   └── queries/                  # Queries reutilizáveis
│   │       ├── bots.ts
│   │       ├── content.ts
│   │       ├── users.ts
│   │       └── earnings.ts
│   ├── workers/
│   │   ├── pix-confirmation.worker.ts
│   │   ├── content-delivery.worker.ts
│   │   └── preview-generation.worker.ts
│   ├── types/
│   │   └── index.ts
│   └── middleware.ts                 # Proteção de rotas por role
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── docker-compose.yml
└── .env.example
```

---

## Schema do Banco de Dados (Drizzle ORM)

Implemente o schema completo com as seguintes tabelas. Use `pgTable` do Drizzle com todos os tipos corretos:

### `users`
```
id: uuid PK default gen_random_uuid()
email: varchar(255) unique not null
password_hash: varchar(255) not null
name: varchar(255) not null
role: enum('owner', 'admin', 'creator') not null default 'creator'
avatar_url: varchar(500)
is_active: boolean default true
platform_fee_percent: decimal(5,2) default 10.00  -- taxa da plataforma por creator
created_at: timestamp default now()
updated_at: timestamp default now()
```

### `bots`
```
id: uuid PK
user_id: uuid FK -> users.id
name: varchar(255) not null
username: varchar(255) unique         -- @username do bot no Telegram
telegram_token: varchar(500) not null -- token do BotFather (criptografado)
description: text
is_active: boolean default false
webhook_url: varchar(500)
total_subscribers: integer default 0
total_revenue: decimal(12,2) default 0.00
created_at: timestamp
updated_at: timestamp
```

### `content`
```
id: uuid PK
bot_id: uuid FK -> bots.id
user_id: uuid FK -> users.id
title: varchar(255) not null
description: text
type: enum('image', 'video', 'file', 'bundle')
price: decimal(10,2) not null
original_key: varchar(500) not null   -- chave S3 do arquivo original
preview_key: varchar(500)             -- chave S3 do preview gerado
original_url: varchar(1000)           -- URL pública temporária (gerada on-demand)
preview_url: varchar(1000)
is_published: boolean default false
purchase_count: integer default 0
total_revenue: decimal(12,2) default 0.00
created_at: timestamp
updated_at: timestamp
```

### `bot_users` (usuários do Telegram que interagiram com bots)
```
id: uuid PK
bot_id: uuid FK -> bots.id
telegram_user_id: bigint not null
telegram_username: varchar(255)
telegram_first_name: varchar(255)
first_seen_at: timestamp
last_seen_at: timestamp
UNIQUE(bot_id, telegram_user_id)
```

### `purchases`
```
id: uuid PK
content_id: uuid FK -> content.id
bot_id: uuid FK -> bots.id
bot_user_id: uuid FK -> bot_users.id
creator_user_id: uuid FK -> users.id
amount: decimal(10,2) not null
platform_fee: decimal(10,2) not null
creator_net: decimal(10,2) not null
pix_txid: varchar(255) unique           -- ID da transação no PSP
pix_qr_code: text                       -- QR Code Pix (e2e id)
pix_copy_paste: text                    -- Pix copia-e-cola
status: enum('pending', 'paid', 'expired', 'refunded') default 'pending'
paid_at: timestamp
expires_at: timestamp
created_at: timestamp
```

### `platform_settings`
```
id: uuid PK
key: varchar(255) unique not null
value: text not null                    -- JSON string para valores complexos
description: text
is_encrypted: boolean default false
updated_by: uuid FK -> users.id
updated_at: timestamp
```

As chaves de configuração incluem:
- `storage_provider`: `"s3"` ou `"wasabi"`
- `storage_bucket`: nome do bucket
- `storage_region`: região
- `storage_endpoint`: endpoint customizado (para Wasabi)
- `storage_access_key_id`: (encrypted)
- `storage_secret_access_key`: (encrypted)
- `storage_public_base_url`: URL pública base
- `telegram_default_welcome_message`: mensagem padrão de boas-vindas
- `platform_fee_percent`: taxa padrão da plataforma
- `pix_provider`: `"mercadopago"` | `"efipay"` | `"asaas"`
- `pix_access_token`: (encrypted)
- `pix_webhook_secret`: (encrypted)

---

## Sistema de Autenticação

Use **NextAuth.js v5** com `CredentialsProvider`:

- Login por email + senha (bcrypt para hash)
- JWT com campos: `id`, `email`, `name`, `role`
- Sessão disponível via `auth()` server-side e `useSession()` client-side
- Middleware protegendo todas as rotas:
  - `/dashboard/*` → autenticado (qualquer role)
  - `/admin/*` → somente `role === 'owner'` ou `role === 'admin'`
  - `/api/admin/*` → idem
- Roles:
  - `owner`: acesso total, único, criado via seed
  - `admin`: acesso ao admin panel, pode gerenciar usuários e ver tudo
  - `creator`: acesso apenas ao próprio dashboard e seus bots

---

## Módulo de Storage (S3/Wasabi)

Crie `src/lib/s3.ts` que:

1. Lê as configurações de storage do banco (`platform_settings`) com cache em memória (5 min TTL).
2. Instancia o `S3Client` dinamicamente com base nas configurações — se provider for `wasabi`, usa o endpoint `https://s3.{region}.wasabisys.com`.
3. Exporta funções:
   - `getS3Client()`: retorna cliente configurado
   - `generatePresignedUploadUrl(key, contentType, expiresIn)`: URL para upload direto
   - `generatePresignedDownloadUrl(key, expiresIn)`: URL temporária para download
   - `deleteObject(key)`: deleta objeto
   - `getPublicUrl(key)`: URL pública (se bucket público) ou presigned

O **upload de arquivos** segue este fluxo:
1. Frontend solicita presigned URL via `POST /api/upload/presigned` com `{ filename, contentType, botId }`.
2. API gera a URL e retorna + a `key` do objeto.
3. Frontend faz `PUT` direto para S3/Wasabi com o arquivo.
4. Frontend notifica o backend com a `key` para registrar o conteúdo no banco.

---

## Módulo de Geração de Preview

Crie `src/lib/preview.ts`:

- **Imagens**: usar Sharp para gerar versão com blur Gaussian (sigma 15-20) + resize para 800px largura + watermark de texto centralizado "🔒 Compre para ver".
- **Vídeos**: usar fluent-ffmpeg para extrair frame do segundo 2 + aplicar blur com Sharp.
- **Outros arquivos**: gerar imagem placeholder com nome do arquivo e ícone.

A geração de preview acontece como **background job** no BullMQ após o upload. O worker `preview-generation.worker.ts` processa a fila, gera o preview, faz upload para S3/Wasabi na key `previews/{contentId}/{filename}`, e atualiza `content.preview_key` no banco.

---

## Módulo Telegram (grammy)

Crie `src/lib/telegram.ts` — um **BotManager** singleton:

```typescript
class BotManager {
  private bots: Map<string, Bot> // botId -> instância grammy

  async startBot(botId: string, token: string, webhookUrl: string): Promise<void>
  async stopBot(botId: string): Promise<void>
  async restartBot(botId: string): Promise<void>
  async getBotInfo(token: string): Promise<TelegramBotInfo>
  async setWebhook(token: string, webhookUrl: string): Promise<void>
  async deleteWebhook(token: string): Promise<void>
  async sendMessage(token: string, chatId: number, text: string, options?: any): Promise<void>
  async sendPhoto(token: string, chatId: number, fileKey: string, caption?: string): Promise<void>
  async sendVideo(token: string, chatId: number, fileKey: string, caption?: string): Promise<void>
  async sendDocument(token: string, chatId: number, fileKey: string, caption?: string): Promise<void>
}
```

Cada bot do Telegram recebe webhooks em `/api/webhooks/telegram/[botId]`. O handler:

1. Valida o token secreto do webhook (header `X-Telegram-Bot-Api-Secret-Token`).
2. Processa comandos:
   - `/start`: envia mensagem de boas-vindas configurada pelo creator + lista de conteúdos disponíveis como inline buttons.
   - `/catalog`: exibe catálogo de conteúdos do bot com preview + preço.
   - Callback query de compra: gera cobrança Pix e envia QR Code.
3. Registra o usuário Telegram em `bot_users` se não existir.

---

## Fluxo Completo de Venda

Implemente este fluxo ponta a ponta:

```
1. Usuário envia /start ou /catalog no bot
2. Bot lista conteúdos disponíveis com preview borrada
   └── Botão inline: "Comprar por R$ X.XX"
3. Usuário clica no botão
4. Bot cria registro em purchases (status: pending)
5. Bot chama API Pix → obtém txid, qr_code, copy_paste
   └── Salva no registro de purchase
6. Bot envia mensagem com QR Code Pix + copia-e-cola + "Expira em 30min"
7. PSP chama POST /api/webhooks/pix com confirmação
8. Webhook handler:
   └── Valida assinatura do PSP
   └── Atualiza purchase.status = 'paid', paid_at = now()
   └── Calcula platform_fee e creator_net
   └── Enqueue job no BullMQ: content-delivery
9. Worker content-delivery:
   └── Gera presigned URL temporária do arquivo original (15min)
   └── Envia arquivo original via bot para o telegram_user_id
   └── Envia mensagem de confirmação
10. Atualiza contadores: content.purchase_count, bot.total_revenue, user stats
```

---

## Creator Dashboard — Páginas e Funcionalidades

### `/dashboard` — Home
- Cards de métricas: total ganho (mês), total ganho (lifetime), bots ativos, total de assinantes, vendas hoje.
- Gráfico de receita dos últimos 30 dias (recharts, área).
- Lista das últimas 10 vendas com status.
- Botão "Criar novo bot".

### `/dashboard/bots` — Lista de Bots
- Cards de cada bot: nome, username Telegram, status (ativo/inativo), receita total, total de assinantes.
- Ações: Ativar/Desativar, Editar, Excluir, Copiar link.
- Botão "Novo Bot".

### `/dashboard/bots/new` — Criar Bot
- Formulário: Nome do bot, Token do BotFather, Mensagem de boas-vindas.
- Ao submeter: valida token com Telegram API (getMe), registra webhook, salva no banco, redireciona para o bot criado.

### `/dashboard/bots/[botId]` — Overview do Bot
- Métricas do bot: receita total, assinantes, vendas, conteúdos publicados.
- Gráfico de vendas dos últimos 30 dias.
- Link do bot (`t.me/username`) com botão copiar.
- Status do webhook (ativo/inativo) com botão para reativar.

### `/dashboard/bots/[botId]/content` — Conteúdo
- Grid de conteúdos com: preview, título, preço, vendas, status (publicado/rascunho).
- Botão "Novo Conteúdo".
- Modal/Drawer de upload:
  - Campo título, descrição, preço (R$).
  - Upload de arquivo (imagem, vídeo, arquivo qualquer).
  - Após upload: mostra preview gerada e permite ajustar antes de publicar.
  - Toggle: publicar imediatamente ou salvar como rascunho.

### `/dashboard/bots/[botId]/subscribers` — Assinantes
- Tabela: username Telegram, primeiro acesso, último acesso, total gasto.
- Paginação.

### `/dashboard/bots/[botId]/settings` — Configurações do Bot
- Editar nome, descrição, mensagem de boas-vindas.
- Campo token (mascarado, com botão para revelar/editar).
- Botão "Reativar Webhook".
- Botão "Excluir Bot" (confirm dialog).

### `/dashboard/earnings` — Ganhos
- Período selecionável (7d, 30d, 90d, custom).
- Total bruto, taxa da plataforma, receita líquida.
- Gráfico de barras por dia.
- Tabela de todas as vendas: data, conteúdo, bot, valor, status.
- Exportar CSV.

---

## Admin Panel — Páginas e Funcionalidades

### `/admin` — Dashboard Global
- Métricas globais: receita total da plataforma, taxa coletada, creators ativos, bots ativos, vendas hoje, total de usuários Telegram.
- Gráfico de receita global (30 dias).
- Top 5 creators por receita.
- Top 5 bots por receita.
- Últimas vendas de todos os bots.

### `/admin/users` — Gestão de Usuários
- Tabela: nome, email, role, bots ativos, receita total, data cadastro, status.
- Filtros: por role, por status.
- Busca por nome/email.
- Ações por usuário: Ver detalhes, Mudar role, Ativar/Desativar, Resetar senha, Excluir.
- Botão "Convidar Usuário" (cria conta com senha temporária).

### `/admin/users/[userId]` — Detalhe do Usuário
- Todas as informações do creator.
- Lista de bots do creator com métricas.
- Histórico de ganhos do creator.
- Configurar taxa da plataforma individual (override do padrão).

### `/admin/bots` — Todos os Bots
- Tabela de todos os bots da plataforma com: creator, nome, username, status, receita, assinantes.
- Ações: Ver detalhes, Forçar ativar/desativar, Ver conteúdo.

### `/admin/earnings` — Receita Global
- Período selecionável.
- Receita bruta total, taxas coletadas, receita líquida dos creators.
- Breakdown por creator (tabela).
- Breakdown por bot (tabela).
- Gráfico de evolução da receita.
- Exportar CSV.

### `/admin/settings` — Configurações da Plataforma
Página com tabs:

**Tab: Geral**
- Taxa padrão da plataforma (%).
- Nome da plataforma.
- URL base da plataforma (usada para construir webhook URLs).

**Tab: Storage**
- Select: Provider (AWS S3 / Wasabi).
- Campos: Bucket Name, Region, Endpoint URL (para Wasabi), Access Key ID, Secret Access Key, Public Base URL.
- Botão "Testar Conexão" (faz listObjects no bucket e retorna status).
- Ao salvar: criptografa as keys antes de salvar no banco.

**Tab: Telegram**
- Mensagem padrão de boas-vindas (textarea, suporta markdown do Telegram).
- URL base para webhooks (ex: `https://meudominio.com/api/webhooks/telegram`).
- Botão "Verificar Webhooks Ativos" (lista todos os bots e status do webhook).

**Tab: Pagamentos (Pix)**
- Select: Provider PSP (Mercado Pago / EFÍ Pay / Asaas).
- Access Token (criptografado).
- Webhook Secret.
- Botão "Testar Integração" (tenta autenticar na API do PSP).

---

## Criptografia de Configurações Sensíveis

Para as chaves sensíveis em `platform_settings`:
- Usar `crypto` nativo do Node.js com AES-256-GCM.
- Chave de criptografia derivada da env `ENCRYPTION_SECRET` (mínimo 32 chars).
- Funções `encrypt(text)` e `decrypt(encrypted)` em `src/lib/crypto.ts`.
- Ao salvar configurações sensíveis via admin: sempre criptografar antes de inserir no banco.
- Ao ler para uso interno: sempre descriptografar.
- Nunca retornar valores descriptografados para o frontend — mascarar com `****`.

---

## Design Visual

Use **Tailwind CSS + shadcn/ui** com as seguintes diretrizes de design:

- **Tema:** Dark mode como padrão, com suporte a light mode via `next-themes`.
- **Cor principal:** Slate/Zinc como base, com accent em Violet (600/500) para ações primárias.
- **Sidebar:** Fixa, colapsável, com ícones (lucide-react).
  - Creator Dashboard sidebar: Dashboard, Meus Bots, Ganhos, Configurações.
  - Admin Panel sidebar: Dashboard, Usuários, Bots, Receita, Configurações.
- **Layout:** Sidebar à esquerda (240px expanded / 64px collapsed) + main content com header.
- **Header:** breadcrumb + nome do usuário + avatar + dropdown (perfil / sair).
- **Cards de métricas:** Ícone colorido + número grande + label + variação percentual com seta.
- **Tabelas:** shadcn/ui DataTable com TanStack Table — suporte a sorting, filtering, pagination.
- **Formulários:** shadcn/ui Form com React Hook Form + Zod validation.
- **Feedback:** Toast (sonner) para sucesso/erro de ações.
- **Loading states:** Skeleton components em todas as listas e cards.
- **Mobile:** Sidebar vira drawer em telas < 768px.

---

## Configuração de Ambiente

Crie `.env.example` com:

```env
# App
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ENCRYPTION_SECRET=

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/botflow

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# Storage (valores padrão — podem ser sobrescritos via admin panel)
DEFAULT_STORAGE_PROVIDER=s3
DEFAULT_STORAGE_BUCKET=
DEFAULT_STORAGE_REGION=us-east-1
DEFAULT_STORAGE_ENDPOINT=
DEFAULT_STORAGE_ACCESS_KEY_ID=
DEFAULT_STORAGE_SECRET_ACCESS_KEY=

# Seed (owner inicial)
SEED_OWNER_EMAIL=admin@botflow.com
SEED_OWNER_PASSWORD=
SEED_OWNER_NAME=Admin
```

---

## Docker Compose

Crie `docker-compose.yml` com serviços:
- `postgres`: imagem `postgres:16-alpine`, volume persistente, porta 5432.
- `redis`: imagem `redis:7-alpine`, porta 6379.

---

## Scripts de Seed

Crie `scripts/seed.ts`:
- Cria o usuário owner com as credenciais das envs.
- Cria configurações padrão em `platform_settings` com valores das envs.
- Idempotente (verifica se já existe antes de criar).

---

## Middleware de Proteção de Rotas

`src/middleware.ts`:
```typescript
// Rotas públicas: /login, /register, /api/webhooks/*
// Rotas autenticadas: /dashboard/*
// Rotas admin: /admin/* (role owner ou admin)
// Redirecionar /login se não autenticado
// Redirecionar /dashboard se autenticado e tentar acessar /login
// Retornar 403 JSON se role insuficiente em /api/admin/*
```

---

## Tratamento de Erros

- Todas as Server Actions retornam `{ success: boolean, data?: T, error?: string }`.
- Todas as API routes retornam `{ success: boolean, data?: T, error?: string }` com HTTP status correto.
- Erros de autenticação: 401.
- Erros de autorização: 403.
- Erros de validação Zod: 422 com detalhes dos campos.
- Erros internos: 500 com mensagem genérica (logar detalhes internamente).

---

## README

Crie `README.md` completo com:
- Visão geral do projeto.
- Pré-requisitos.
- Setup local (clone, pnpm install, configurar .env, docker-compose up, drizzle migrate, seed, pnpm dev).
- Descrição das principais funcionalidades.
- Estrutura de pastas comentada.
- Como adicionar um novo bot (passo a passo).
- Como configurar storage Wasabi vs S3.
- Variáveis de ambiente documentadas.

---

## Requisitos de Implementação

1. **Comece** pela estrutura do projeto, `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`.
2. **Depois** o schema do banco e migrations.
3. **Depois** autenticação (NextAuth + middleware).
4. **Depois** os módulos lib (s3, telegram, preview, queue, crypto).
5. **Depois** as Server Actions e API routes.
6. **Depois** os componentes de UI (layout, sidebar, header, shared components).
7. **Por último** as páginas, na ordem: auth → dashboard → admin.
8. **Ao final** o README, docker-compose e seed.

Implemente **tudo** — não deixe arquivos como placeholder ou com comentário "TODO: implementar". Cada arquivo deve ter código funcional completo.

Quando precisar de uma integração com PSP Pix real, implemente o cliente para **EFÍ Pay (ex-Gerencianet)** como padrão, pois tem API REST bem documentada e suporte amplo no Brasil. O cliente deve ser abstraído atrás de uma interface `PixProvider` para facilitar troca futura.

---

## Resultado Esperado

Uma aplicação **production-ready** que um desenvolvedor consegue rodar localmente com `docker-compose up && pnpm dev` após configurar o `.env`, e que está pronta para ser deployada em qualquer plataforma Node.js (Vercel, Railway, Fly.io, VPS).
