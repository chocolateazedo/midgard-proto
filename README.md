# BotFlow

Plataforma SaaS multi-tenant para creators monetizarem conteúdo digital via Telegram Bots com pagamento por Pix.

## Funcionalidades

- **Multi-tenant**: cada creator gerencia seus próprios bots e conteúdo
- **Telegram Bots**: criação e gerenciamento completo via painel web (grammy)
- **Paywall com Pix**: pagamento instantâneo via QR Code Pix (EFÍ Pay)
- **Preview com blur**: imagens e vídeos com preview borrado antes da compra
- **Upload direto para S3/Wasabi**: presigned URLs para upload eficiente
- **Painel Admin**: gestão completa de usuários, bots, receita e configurações
- **Dashboard Creator**: métricas, gestão de conteúdo, histórico de vendas
- **Background Jobs**: processamento assíncrono de pagamentos e previews (BullMQ)
- **Dark Mode**: interface moderna com Tailwind CSS + shadcn/ui

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 14+ (App Router, SSR)
- **Linguagem**: TypeScript (strict)
- **Banco de Dados**: PostgreSQL + Drizzle ORM
- **Autenticação**: NextAuth.js v5 (credentials + JWT)
- **Storage**: AWS S3 / Wasabi (configurável via painel)
- **Fila**: BullMQ + Redis
- **Telegram**: grammy
- **Pagamentos**: EFÍ Pay (Pix)
- **UI**: Tailwind CSS + shadcn/ui + Recharts

## Pré-requisitos

- Node.js 20+
- pnpm
- Docker e Docker Compose (para PostgreSQL e Redis)

## Setup Local

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

# 5. Execute as migrations
pnpm db:push

# 6. Execute o seed (cria o usuário owner)
pnpm db:seed

# 7. Inicie o servidor de desenvolvimento
pnpm dev

# 8. (Opcional) Inicie os workers em outro terminal
pnpm workers
```

Acesse `http://localhost:3000` e faça login com as credenciais do seed.

## Como Adicionar um Novo Bot

1. Crie um bot no Telegram via [@BotFather](https://t.me/BotFather)
2. Copie o token gerado
3. Acesse o painel em `/dashboard/bots/new`
4. Preencha o nome, cole o token e configure a mensagem de boas-vindas
5. O sistema valida o token, registra o webhook e ativa o bot automaticamente
6. Adicione conteúdo em `/dashboard/bots/[botId]/content`

## Configurar Storage (S3 vs Wasabi)

### AWS S3
1. Acesse `/admin/settings` -> aba **Storage**
2. Selecione "AWS S3"
3. Preencha: Bucket, Region, Access Key ID, Secret Access Key
4. Clique em "Testar Conexão" para verificar
5. Salve

### Wasabi
1. Acesse `/admin/settings` -> aba **Storage**
2. Selecione "Wasabi"
3. Preencha: Bucket, Region (ex: `us-east-1`)
4. O endpoint é configurado automaticamente (`https://s3.{region}.wasabisys.com`)
5. Preencha Access Key ID e Secret Access Key
6. Clique em "Testar Conexão" para verificar
7. Salve

## Estrutura de Pastas

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login e registro
│   ├── (dashboard)/        # Painel do creator
│   ├── (admin)/            # Painel administrativo
│   └── api/                # API routes e webhooks
├── components/
│   ├── ui/                 # Componentes shadcn/ui
│   ├── shared/             # Sidebar, header, data-table, etc.
│   ├── dashboard/          # Componentes do dashboard
│   └── admin/              # Componentes do admin
├── lib/
│   ├── db/                 # Drizzle ORM (schema, conexão, migrations)
│   ├── auth.ts             # NextAuth.js configuração
│   ├── s3.ts               # Cliente S3/Wasabi dinâmico
│   ├── telegram.ts         # BotManager (grammy)
│   ├── queue.ts            # BullMQ filas
│   ├── preview.ts          # Geração de previews (Sharp/ffmpeg)
│   ├── pix.ts              # Integração Pix (EFÍ Pay)
│   ├── crypto.ts           # Criptografia AES-256-GCM
│   └── validations.ts      # Schemas Zod
├── server/
│   ├── actions/            # Server Actions
│   └── queries/            # Queries reutilizáveis
├── workers/                # Background jobs (BullMQ)
├── types/                  # TypeScript types
└── middleware.ts            # Proteção de rotas
```

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL | Sim |
| `NEXTAUTH_SECRET` | Secret para JWT/sessão | Sim |
| `NEXTAUTH_URL` | URL base da aplicação | Sim |
| `ENCRYPTION_SECRET` | Chave para criptografia AES (min 32 chars) | Sim |
| `REDIS_URL` | URL de conexão Redis | Não (default: redis://localhost:6379) |
| `SEED_OWNER_EMAIL` | Email do owner inicial | Sim (para seed) |
| `SEED_OWNER_PASSWORD` | Senha do owner inicial | Sim (para seed) |
| `SEED_OWNER_NAME` | Nome do owner inicial | Não (default: Admin) |
| `DEFAULT_STORAGE_*` | Configurações padrão de storage | Não |

## Roles

- **owner**: acesso total, criado via seed, único
- **admin**: acesso ao painel admin, gerencia usuários e configurações
- **creator**: acesso ao dashboard, gerencia seus bots e conteúdo

## Deploy

A aplicação pode ser deployada em qualquer plataforma Node.js:

- **Vercel**: deploy do Next.js, workers em serviço separado
- **Railway**: deploy completo com PostgreSQL e Redis inclusos
- **Fly.io**: deploy com Dockerfile
- **VPS**: PM2 ou Docker

Certifique-se de que as variáveis de ambiente estão configuradas e que PostgreSQL e Redis estão acessíveis.
