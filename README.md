# BotFlow

Plataforma SaaS multi-tenant onde creators gerenciam bots do Telegram para vender conteúdo digital (imagens, vídeos, arquivos) com paywall via Pix.

---

## Visão Geral

O BotFlow conecta criadores de conteúdo a seus fãs no Telegram. Cada creator recebe um painel web para configurar seu bot, fazer upload de conteúdo e acompanhar vendas em tempo real. A plataforma cobra uma taxa configurável por venda (padrão 10%) e oferece um painel administrativo completo para o operador da plataforma.

**Fluxo principal:**
1. Creator cadastra seu bot do Telegram no painel
2. Faz upload de conteúdo (imagens, vídeos, arquivos) com preço ou gratuito
3. Usuário do Telegram acessa o bot → navega no catálogo → compra via Pix
4. Pagamento confirmado → conteúdo entregue automaticamente via Telegram

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| **Framework** | Next.js 14+ (App Router, Server Actions, SSR) |
| **Linguagem** | TypeScript (strict mode) |
| **ORM** | Prisma 6 |
| **Banco de Dados** | PostgreSQL 16 |
| **Cache/Fila** | Redis 7 + BullMQ |
| **Autenticação** | NextAuth.js v5 (credentials, JWT) |
| **Telegram** | grammy |
| **Pagamentos** | Pix (EFÍ Pay, Woovi/OpenPix) |
| **Storage** | AWS S3 / Wasabi (configurável) |
| **Processamento de mídia** | Sharp (imagens) + fluent-ffmpeg (vídeos) |
| **Criptografia** | AES-256-GCM (tokens, chaves de API) |
| **UI** | Tailwind CSS + shadcn/ui (Radix UI) |
| **Gráficos** | Recharts |
| **Formulários** | React Hook Form + Zod |
| **Toasts** | Sonner |
| **Ícones** | Lucide React |
| **Tabelas** | TanStack Table |

---

## Funcionalidades

### Para Creators (Dashboard)

- **Gerenciamento de Bots**: criar, configurar e monitorar bots do Telegram
- **Upload de Conteúdo**: imagens, vídeos, arquivos e bundles com upload direto para S3 via presigned URLs
- **Conteúdo Gratuito ou Pago**: toggle para definir se o conteúdo é gratuito ou tem preço
- **Preview de Upload**: visualização de thumbnail ao fazer upload de imagens e vídeos
- **Visualização de Mídia**: clicar no conteúdo para ver imagem em tamanho real ou reproduzir vídeo
- **Planos de Assinatura**: criar planos mensais, trimestrais, semestrais e anuais com benefícios customizáveis
- **Live Streaming**: configurar transmissões ao vivo com preço ou gratuitas para assinantes
- **Mensagem de Boas-vindas**: personalizar o `/start` com texto, mídia e botões inline
- **Catálogo**: controlar visibilidade do conteúdo (publicar/despublicar)
- **Métricas**: receita total, vendas do dia, total de assinantes, planos ativos
- **Gráfico de Receita**: tendência de receita dos últimos 30 dias
- **Lista de Assinantes**: todos os usuários do Telegram que interagiram com o bot
- **Histórico de Vendas**: últimas transações com status

### Para Administradores (Admin Panel)

- **Dashboard**: métricas da plataforma, top creators, top bots, vendas recentes
- **Gestão de Usuários**: criar creators (com bot), ativar/desativar, definir taxa de comissão individual
- **Monitoramento de Bots**: listar todos os bots, ordenar por receita/assinantes
- **Receita da Plataforma**: breakdown de receita, taxas cobradas, performance por creator/bot
- **Configurações**:
  - **Storage**: S3 vs Wasabi, bucket, região, credenciais (com teste de conexão)
  - **Pix**: selecionar provedor (EFÍ Pay ou Woovi), configurar tokens de API
  - **Telegram**: URL base para webhooks
  - **Geral**: nome da plataforma, taxa padrão

### Telegram Bot (Usuário Final)

| Comando | Descrição |
|---|---|
| `/start` | Mensagem de boas-vindas configurável com botões |
| `/catalog` | Lista todo conteúdo publicado com preços |
| `/buy <id>` | Gera QR Code Pix para compra de conteúdo |
| `/subscribe <id>` | Gera QR Code Pix para assinatura de plano |
| `/live` | Verifica status de live e acesso |

---

## Arquitetura

### Visão Geral do Sistema

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Creator Web   │     │  Telegram User   │     │   Admin Web     │
│   (Dashboard)   │     │   (Bot Chat)     │     │   (Panel)       │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  Pages   │  │ Server       │  │ API       │  │ Middleware   │  │
│  │  (SSR)   │  │ Actions      │  │ Routes    │  │ (Auth/RBAC) │  │
│  └──────────┘  └──────────────┘  └───────────┘  └─────────────┘  │
└───────────────────────────┬───────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌────────────────┐ ┌───────────────┐ ┌─────────────────┐
│   PostgreSQL   │ │     Redis     │ │   S3 / Wasabi   │
│   (Prisma)     │ │   (BullMQ)    │ │   (Storage)     │
└────────────────┘ └───────┬───────┘ └─────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │    Background Workers   │
              │  ┌───────────────────┐  │
              │  │ Pix Confirmation  │  │
              │  │ Content Delivery  │  │
              │  │ Preview Gen       │  │
              │  │ Notification      │  │
              │  │ Subscription Exp  │  │
              │  └───────────────────┘  │
              └─────────────────────────┘
```

### Fluxo de Autenticação

- **Provider**: Credentials (email + senha com bcryptjs)
- **Estratégia**: JWT (sessão de 30 dias)
- **Roles**: `owner` (único, via seed), `admin`, `creator`
- **Middleware**: protege rotas por role — `/dashboard/*` requer auth, `/admin/*` requer owner/admin
- **Troca de Senha Obrigatória**: se `mustChangePassword=true`, redireciona para `/change-password` antes de qualquer acesso

### Fluxo de Pagamento (Pix)

```
Usuário Telegram → /buy <contentId>
        │
        ▼
Verifica compra existente (reentrega sem cobrar)
        │ (nova compra)
        ▼
Cria Purchase (status: pending) → Chama API do Pix Provider
        │
        ▼
Retorna QR Code + código copia-e-cola ao usuário
        │
        ▼
Usuário paga → Webhook do Pix Provider confirma
        │
        ▼
pix-confirmation-worker atualiza status → paid
        │
        ▼
content-delivery-worker envia conteúdo via Telegram
(link presigned com 15min de validade)
```

**Split de pagamento por venda:**
- **Valor**: definido pelo creator (ex: R$ 10,00)
- **Taxa da Plataforma**: valor × `platformFeePercent` do creator (ex: 10% = R$ 1,00)
- **Líquido do Creator**: valor - taxa (ex: R$ 9,00)

### Fluxo de Upload de Conteúdo

```
Creator seleciona arquivo no browser
        │
        ▼
Frontend solicita presigned URL → POST /api/upload/presigned
        │
        ▼
Browser faz upload direto para S3/Wasabi (PUT com presigned URL)
        │
        ▼
Server Action createContent() salva metadados no banco
        │
        ▼
Enfileira job de geração de preview (BullMQ)
        │
        ▼
preview-generation-worker:
  • Imagem → blur + watermark "Compre para ver" + resize (800px, JPEG q60)
  • Vídeo → thumbnail no frame 2s → blur + watermark
  • Arquivo → placeholder SVG colorido com extensão
        │
        ▼
Upload do preview para S3: previews/{contentId}/{nome}_preview.jpg
```

### Background Workers

Executados via `pnpm workers` em processo separado (5 workers de concorrência):

| Worker | Função | Retentativas |
|---|---|---|
| **pix-confirmation** | Consulta status do pagamento na API do Pix provider | 3x (backoff exponencial) |
| **content-delivery** | Gera presigned URL e envia conteúdo via Telegram | 3x |
| **preview-generation** | Gera previews borrados para conteúdo | 2x |
| **notification** | Envia notificações via Telegram (assinatura, live) | 3x |
| **subscription-expiry** | Verifica assinaturas expiradas a cada hora | — |

O worker de notificação respeita rate limits do Telegram (50ms entre mensagens, ~20 msgs/seg).

---

## Modelo de Dados

### Entidades Principais

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  User    │────▶│   Bot    │────▶│   Content    │
│ (creator)│  1:N│          │  1:N│              │
└──────────┘     └────┬─────┘     └──────┬───────┘
                      │                  │
                      │ 1:N              │ 1:N
                      ▼                  ▼
                ┌──────────┐     ┌──────────────┐
                │ BotUser  │     │  Purchase    │
                │(telegram)│────▶│              │
                └────┬─────┘     └──────────────┘
                     │
                     │ 1:N
                     ▼
               ┌─────────────┐     ┌──────────────────┐
               │Subscription │────▶│SubscriptionPlan  │
               └─────────────┘     └──────────────────┘
```

| Modelo | Campos Principais |
|---|---|
| **User** | email, passwordHash, role (owner/admin/creator), platformFeePercent, isActive, mustChangePassword |
| **Bot** | name, username, telegramToken (encrypted), webhookUrl, isActive, totalSubscribers, totalRevenue |
| **Content** | title, type (image/video/file/bundle), price, originalKey, previewKey, isPublished, purchaseCount, totalRevenue |
| **BotUser** | telegramUserId, telegramUsername, telegramFirstName, firstSeenAt, lastSeenAt |
| **Purchase** | amount, platformFee, creatorNet, pixTxid, pixQrCode, status (pending/paid/expired/refunded), paidAt |
| **SubscriptionPlan** | name, price, period (monthly/quarterly/semiannual/annual), benefits (JSON), includesLiveAccess |
| **Subscription** | status (active/expired/cancelled), amount, platformFee, creatorNet, startDate, endDate |
| **WelcomeMessage** | text, mediaType, mediaKey, buttons (JSON), sendOnEveryStart |
| **LiveStream** | isLive, title, price, streamLink, notifySubscribers |
| **PlatformSetting** | key, value, isEncrypted — armazena config de storage, pix, etc. |

Valores monetários (`price`, `amount`, `platformFee`, `creatorNet`, `totalRevenue`) usam `Decimal(10,2)` para precisão financeira.

---

## Estrutura de Pastas

```
src/
├── app/                                 # Next.js App Router
│   ├── login/                           # Página de login
│   ├── change-password/                 # Troca de senha obrigatória
│   ├── dashboard/                       # Painel do Creator
│   │   ├── page.tsx                     # Visão geral + métricas
│   │   ├── bots/
│   │   │   ├── page.tsx                 # Lista de bots
│   │   │   ├── new/page.tsx             # Criar bot
│   │   │   └── [botId]/
│   │   │       ├── page.tsx             # Overview do bot
│   │   │       ├── content/             # Gerenciar conteúdo
│   │   │       ├── subscribers/         # Lista de assinantes
│   │   │       └── settings/            # Configurações do bot
│   │   │           └── components/
│   │   │               ├── general-tab  # Nome, descrição, conexão
│   │   │               ├── welcome-tab  # Mensagem de boas-vindas
│   │   │               ├── plans-tab    # Planos de assinatura
│   │   │               ├── catalog-tab  # Visibilidade do catálogo
│   │   │               └── live-tab     # Configuração de live
│   │   ├── earnings/                    # Dashboard de receita
│   │   └── settings/                    # Perfil do creator
│   ├── admin/                           # Painel Administrativo
│   │   ├── page.tsx                     # Métricas da plataforma
│   │   ├── users/                       # Gestão de creators
│   │   ├── bots/                        # Monitoramento de bots
│   │   ├── earnings/                    # Receita da plataforma
│   │   └── settings/                    # Configurações gerais
│   └── api/
│       ├── auth/[...nextauth]/          # NextAuth endpoints
│       ├── webhooks/
│       │   ├── telegram/[botId]/        # Webhook do Telegram
│       │   └── pix/                     # Webhook do Pix provider
│       ├── bots/                        # CRUD de bots
│       ├── content/[contentId]/
│       │   ├── route.ts                 # GET/PUT/DELETE conteúdo
│       │   ├── original/route.ts        # Redirect → presigned URL original
│       │   └── preview/route.ts         # Redirect → presigned URL preview
│       ├── upload/presigned/            # Gerar presigned URL de upload
│       ├── admin/                       # Operações administrativas
│       └── diagnostics/                 # Health check (PostgreSQL, Redis, S3)
├── components/
│   ├── ui/                              # Componentes shadcn/ui
│   ├── shared/                          # Header, sidebar, data-table
│   └── dashboard/                       # Componentes específicos
├── lib/
│   ├── auth.ts                          # NextAuth config (com provider)
│   ├── auth.config.ts                   # Config edge-compatible (middleware)
│   ├── db/index.ts                      # Prisma client singleton
│   ├── telegram.ts                      # BotManager (grammy)
│   ├── pix.ts                           # Providers Pix (EFÍ Pay, Woovi)
│   ├── s3.ts                            # Cliente S3/Wasabi com cache
│   ├── preview.ts                       # Geração de previews (Sharp/ffmpeg)
│   ├── queue.ts                         # Configuração BullMQ
│   ├── crypto.ts                        # AES-256-GCM encrypt/decrypt
│   ├── validations.ts                   # Schemas Zod
│   └── utils.ts                         # formatCurrency, formatDate, cn()
├── server/
│   ├── actions/                         # Server Actions (retornam {success, data?, error?})
│   │   ├── auth.actions.ts
│   │   ├── bot.actions.ts
│   │   ├── content.actions.ts
│   │   ├── subscription-plan.actions.ts
│   │   ├── live.actions.ts
│   │   ├── welcome.actions.ts
│   │   ├── settings.actions.ts
│   │   └── admin.actions.ts
│   └── queries/                         # Queries reutilizáveis
│       ├── bots.ts
│       ├── content.ts
│       ├── earnings.ts
│       ├── subscriptions.ts
│       └── users.ts
├── workers/                             # Background workers (BullMQ)
│   ├── index.ts                         # Startup/shutdown de todos os workers
│   ├── pix-confirmation.worker.ts
│   ├── content-delivery.worker.ts
│   ├── preview-generation.worker.ts
│   ├── notification.worker.ts
│   └── subscription-expiry.worker.ts
├── types/index.ts                       # Tipos exportados do Prisma
└── middleware.ts                         # Proteção de rotas por role
```

---

## Configuração e Setup

### Pré-requisitos

- Node.js 20+
- pnpm
- Docker e Docker Compose (para PostgreSQL e Redis)

### Instalação

```bash
# 1. Clone o repositório
git clone <repo-url>
cd botflow

# 2. Instale as dependências
pnpm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 4. Suba PostgreSQL e Redis
docker-compose up -d

# 5. Aplique o schema no banco
pnpm db:push

# 6. Execute o seed (cria o usuário owner + configurações iniciais)
pnpm db:seed

# 7. Inicie o servidor de desenvolvimento
pnpm dev

# 8. Em outro terminal, inicie os workers
pnpm workers
```

Acesse `http://localhost:3000` e faça login com as credenciais definidas no seed.

### Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL | Sim |
| `NEXTAUTH_SECRET` | Secret para JWT/sessão | Sim |
| `NEXTAUTH_URL` | URL base da aplicação (ex: `http://localhost:3000`) | Sim |
| `ENCRYPTION_SECRET` | Chave para criptografia AES-256-GCM (mín. 32 caracteres) | Sim |
| `SEED_OWNER_EMAIL` | Email do owner inicial (default: `admin@botflow.com`) | Sim (para seed) |
| `SEED_OWNER_PASSWORD` | Senha do owner inicial | Sim (para seed) |
| `SEED_OWNER_NAME` | Nome do owner inicial (default: `Admin`) | Não |
| `REDIS_URL` | URL de conexão Redis (default: `redis://localhost:6379`) | Não |
| `DEFAULT_STORAGE_PROVIDER` | Provider de storage padrão (`s3` ou `wasabi`) | Não |
| `DEFAULT_STORAGE_BUCKET` | Bucket S3/Wasabi padrão | Não |
| `DEFAULT_STORAGE_REGION` | Região do bucket padrão | Não |
| `DEFAULT_STORAGE_ENDPOINT` | Endpoint customizado (Wasabi) | Não |
| `DEFAULT_STORAGE_ACCESS_KEY_ID` | Access Key do storage | Não |
| `DEFAULT_STORAGE_SECRET_ACCESS_KEY` | Secret Key do storage | Não |

As credenciais de Storage e Pix também podem ser configuradas pelo painel admin (`/admin/settings`), onde são salvas de forma encriptada no banco.

### Scripts Disponíveis

```bash
pnpm dev              # Servidor de desenvolvimento (porta 3000)
pnpm build            # Build de produção (roda prisma generate antes)
pnpm start            # Servidor de produção
pnpm lint             # ESLint
pnpm workers          # Workers BullMQ (pix, delivery, preview, notificação, expiração)
pnpm db:generate      # Gerar Prisma Client
pnpm db:migrate       # Rodar migrations (dev)
pnpm db:push          # Push do schema direto (sem migration)
pnpm db:studio        # Abrir Prisma Studio
pnpm db:seed          # Seed do owner + configurações
```

---

## Segurança

- **Tokens encriptados**: tokens do Telegram e chaves de API de Pix são encriptados com AES-256-GCM antes de serem salvos no banco
- **Presigned URLs**: conteúdo nunca é exposto diretamente — URLs de download têm validade de 15 minutos, uploads de 1 hora
- **Valores sensíveis mascarados**: o frontend nunca recebe valores descriptografados — exibe `****` no lugar
- **Hashing de senhas**: bcryptjs com salt factor 12
- **Middleware RBAC**: todas as rotas protegidas por role no middleware do Next.js
- **Validação com Zod**: toda entrada de dados validada com schemas Zod tanto no cliente quanto no servidor
- **Isolamento multi-tenant**: creators só acessam seus próprios bots e conteúdos

---

## Roles e Permissões

| Role | Acesso | Criação |
|---|---|---|
| **owner** | Acesso total — admin + dashboard + todas as configurações | Via seed (único) |
| **admin** | Painel admin, gerenciar usuários e configurações da plataforma | Criado pelo owner |
| **creator** | Dashboard próprio, gerenciar seus bots e conteúdo | Criado pelo admin |

O middleware redireciona automaticamente: owners/admins em `/dashboard` vão para `/admin`, creators não acessam `/admin`.

---

## Configurar Storage (S3 / Wasabi)

### AWS S3
1. Acesse `/admin/settings` → aba **Storage**
2. Selecione "AWS S3"
3. Preencha: Bucket, Region, Access Key ID, Secret Access Key
4. Clique em "Testar Conexão" para validar
5. Salve

### Wasabi
1. Acesse `/admin/settings` → aba **Storage**
2. Selecione "Wasabi"
3. Preencha: Bucket, Region (ex: `us-east-1`)
4. O endpoint é configurado automaticamente (`https://s3.{region}.wasabisys.com`)
5. Preencha Access Key ID e Secret Access Key
6. Clique em "Testar Conexão" para validar
7. Salve

---

## Como Adicionar um Bot

1. Crie um bot no Telegram via [@BotFather](https://t.me/BotFather)
2. Copie o token gerado
3. No painel, acesse **Bots → Novo Bot**
4. Preencha o nome, cole o token e opcionalmente configure a descrição
5. O sistema valida o token com a API do Telegram, registra o webhook e ativa o bot
6. Configure a mensagem de boas-vindas em **Configurações → Boas-vindas**
7. Adicione conteúdo em **Conteúdo** e publique
8. Crie planos de assinatura em **Configurações → Planos** (opcional)

---

## Deploy

A aplicação pode ser deployada em qualquer plataforma Node.js. Necessita de PostgreSQL e Redis acessíveis.

| Plataforma | Observações |
|---|---|
| **Railway** | Deploy completo com PostgreSQL e Redis inclusos |
| **Vercel** | Next.js na Vercel, workers em serviço separado (Railway, Fly.io) |
| **Fly.io** | Deploy com Dockerfile |
| **VPS** | PM2 ou Docker Compose |

**Importante:** os workers (`pnpm workers`) precisam rodar em um processo separado do servidor Next.js. Em plataformas serverless (Vercel), os workers devem ser hospedados em outro serviço.

```bash
# Produção
pnpm build
pnpm start          # Terminal 1: servidor Next.js
pnpm workers        # Terminal 2: background workers
```

---

## Licença

Projeto privado. Todos os direitos reservados.
