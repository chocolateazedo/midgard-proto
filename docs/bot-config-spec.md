# Feature: Configuração Completa de Bot Telegram

## Contexto

Este documento instrui o agente de desenvolvimento a implementar a tela/seção de **configuração de um bot** dentro do SaaS de gerenciamento de bots Telegram. A configuração de um bot deve contemplar quatro módulos distintos, descritos abaixo.

---

## Módulo 1 — Mensagem de Boas-Vindas

O operador do bot deve conseguir configurar a mensagem que será enviada automaticamente ao usuário quando ele iniciar uma conversa (`/start`) ou entrar no bot pela primeira vez.

**Campos esperados:**
- Texto da mensagem de boas-vindas (suporte a Markdown do Telegram: negrito, itálico, links, etc.)
- Opção de anexar uma mídia à mensagem (imagem ou vídeo de apresentação)
- Botões inline opcionais para direcionar o usuário (ex.: "Ver planos", "Ver catálogo", "Falar com suporte")

**Comportamento:**
- A mensagem deve ser enviada uma única vez ao usuário no primeiro contato, ou sempre que ele enviar `/start`
- Deve haver preview da mensagem antes de salvar

---

## Módulo 2 — Planos de Assinatura

O operador deve conseguir criar e gerenciar planos de acesso recorrente ao conteúdo do bot.

**Campos por plano:**
- Nome do plano (ex.: "Básico", "VIP", "Premium")
- Descrição curta exibida ao usuário
- Preço (em BRL, com suporte a Pix como método de pagamento)
- Período de vigência: mensal, trimestral, semestral ou anual
- Lista de benefícios incluídos no plano (campo de texto livre, exibido como lista para o usuário)
- Status: ativo ou inativo

**Comportamento:**
- O bot deve exibir os planos ativos quando o usuário solicitar (ex.: comando `/planos` ou botão na mensagem de boas-vindas)
- Ao selecionar um plano, o usuário deve receber o link/QR code de pagamento via Pix
- Após confirmação do pagamento, o acesso do usuário deve ser atualizado automaticamente

---

## Módulo 3 — Catálogo de Fotos e Vídeos (Compra Avulsa)

O operador deve conseguir cadastrar um catálogo de mídias (fotos e vídeos) disponíveis para compra individual, sem necessidade de assinatura.

**Campos por item do catálogo:**
- Título do conteúdo
- Descrição/legenda
- Tipo: foto ou vídeo
- Thumbnail de preview (imagem de prévia, pode ser desfocada ou com marca d'água)
- Preço individual (em BRL)
- Status: disponível ou indisponível

**Comportamento:**
- O usuário acessa o catálogo via comando ou botão (ex.: `/catalogo`)
- Cada item exibe o thumbnail, título, descrição e preço
- Ao comprar, o usuário recebe o link de pagamento Pix e, após confirmação, recebe a mídia completa diretamente no chat
- O histórico de compras do usuário deve ser verificado para evitar cobranças duplicadas (se o usuário já comprou aquele item, ele recebe novamente sem novo pagamento)

---

## Módulo 4 — Status de Streaming ao Vivo

O operador deve conseguir informar se está atualmente realizando uma transmissão ao vivo, e os usuários devem ser notificados e conseguir pagar pelo acesso ao link.

**Campos de configuração:**
- Toggle de status: **Ao Vivo** / **Offline**
- Título/descrição da live (ex.: "Live especial de hoje — 21h")
- Preço de acesso ao link da live (em BRL) — pode ser R$ 0,00 para acesso gratuito
- Link da transmissão (ex.: link privado do YouTube, Zoom, Telegram, etc.)
- Opção de notificar todos os assinantes ativos ao ativar o status "Ao Vivo"

**Comportamento quando Ao Vivo = true:**
- Um banner/aviso de "🔴 AO VIVO AGORA" deve aparecer nas interações do bot com o usuário
- O usuário pode acessar via comando ou botão (ex.: `/live`)
- Se o preço for > R$ 0,00: o usuário recebe o link de pagamento Pix e, após confirmação, recebe o link privado da transmissão
- Se o preço for R$ 0,00: o usuário recebe o link direto sem necessidade de pagamento
- Assinantes de planos que incluam acesso à live como benefício devem receber o link diretamente, sem cobrança adicional

**Comportamento quando Ao Vivo = false:**
- Nenhum banner é exibido
- Caso o usuário tente acessar `/live`, recebe uma mensagem informando que não há live no momento

---

## Notas Gerais de Implementação

- Todos os módulos fazem parte da página de configuração de um bot específico (escopo por `bot_id`)
- As configurações devem ser salvas e refletidas em tempo real no comportamento do bot
- O sistema de pagamento via Pix deve ser centralizado e reutilizado entre os módulos (planos, catálogo e live)
- Considerar a experiência mobile-first no painel de configuração, pois operadores frequentemente gerenciam pelo celular