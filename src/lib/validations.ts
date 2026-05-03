import { z } from "zod";

// ---------------------------------------------------------------------------
// Dados de pagamento (creator/manager) — helpers de normalização + validação
// ---------------------------------------------------------------------------

/** Remove tudo que não é dígito. */
function onlyDigits(s: string): string {
  return s.replace(/\D+/g, "");
}

/** Valida CPF pelos dois dígitos verificadores. Recebe string já só com dígitos. */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // rejeita 00000000000, 11111111111 etc.
  const calcCheck = (sliceLen: number): number => {
    let sum = 0;
    for (let i = 0; i < sliceLen; i++) {
      sum += parseInt(digits[i]!, 10) * (sliceLen + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return (
    calcCheck(9) === parseInt(digits[9]!, 10) &&
    calcCheck(10) === parseInt(digits[10]!, 10)
  );
}

/** Aceita CPF com ou sem máscara; armazena só dígitos. */
export const cpfSchema = z
  .string()
  .trim()
  .transform((v) => onlyDigits(v))
  .refine((v) => v.length === 11, "CPF deve ter 11 dígitos")
  .refine(isValidCpf, "CPF inválido");

/**
 * Telefone celular BR. Aceita formatos "(11) 99999-9999", "11999999999",
 * "+5511999999999". Normaliza para E.164 +55XXXXXXXXXXX (13 chars).
 */
export const phoneBrSchema = z
  .string()
  .trim()
  .transform((v) => {
    const digits = onlyDigits(v);
    // Remove DDI 55 se já veio; reaplica ao final.
    const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
    return local;
  })
  .refine((v) => v.length === 10 || v.length === 11, "Telefone deve ter DDD + número")
  .refine(
    (v) => v.length === 11 && v[2] === "9",
    "Informe um celular válido (DDD + 9 + 8 dígitos)"
  )
  .transform((v) => `+55${v}`);

/** Normaliza chave Pix de acordo com o tipo. */
function normalizePixKey(type: "cpf" | "cnpj" | "email" | "phone" | "random", raw: string): string {
  const trimmed = raw.trim();
  if (type === "cpf" || type === "cnpj") return onlyDigits(trimmed);
  if (type === "email") return trimmed.toLowerCase();
  if (type === "phone") {
    const d = onlyDigits(trimmed);
    const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
    return `+55${local}`;
  }
  return trimmed; // random (UUID) preserva formato
}

/** Validação final da chave conforme o tipo. */
function isValidPixKeyForType(
  type: "cpf" | "cnpj" | "email" | "phone" | "random",
  key: string
): boolean {
  switch (type) {
    case "cpf":
      return key.length === 11 && isValidCpf(key);
    case "cnpj":
      return key.length === 14 && /^\d{14}$/.test(key);
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
    case "phone":
      return /^\+55\d{10,11}$/.test(key);
    case "random":
      // UUID v4 (formato padrão das chaves aleatórias do Pix).
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  }
}

/** Par { pixKey, pixKeyType }. Valida formato e devolve a chave normalizada. */
export const pixKeyPairSchema = z
  .object({
    pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]),
    pixKey: z.string().trim().min(1, "Informe a chave Pix"),
  })
  .transform((d) => ({
    pixKeyType: d.pixKeyType,
    pixKey: normalizePixKey(d.pixKeyType, d.pixKey),
  }))
  .refine(
    (d) => isValidPixKeyForType(d.pixKeyType, d.pixKey),
    { message: "Chave Pix inválida para o tipo selecionado", path: ["pixKey"] }
  );

// Permite o chamador enviar "limpar" (null) ou deixar ausente (undefined).
// Quando presente, os dois campos vêm juntos e são validados.
export const optionalPixKeyPair = z
  .union([z.null(), pixKeyPairSchema])
  .optional();

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export const createBotSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  telegramToken: z.string().min(10, "Token inválido"),
  description: z.string().optional(),
  welcomeMessage: z.string().optional(),
  userId: z.string().uuid("ID do usuário inválido").optional(),
});

export const updateBotSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  welcomeMessage: z.string().optional(),
  telegramToken: z.string().min(10).optional(),
});

export const createContentSchema = z.object({
  botId: z.string().uuid(),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  type: z.enum(["image", "video", "file", "bundle"]),
  price: z.coerce.number().min(0, "Preço não pode ser negativo"),
  originalKey: z.string().min(1),
  availability: z.enum(["available", "inactive"]).optional().default("available"),
});

export const updateContentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
  availability: z.enum(["available", "inactive"]).optional(),
  deliveryMode: z.enum(["ondemand", "catalog"]).optional(),
});

// Fluxo simplificado "+ Publicar": uma única action cobre publicar agora
// ou agendar, ondemand (venda avulsa) ou catalog (entrega a assinantes).
export const publishContentSchema = z
  .object({
    botId: z.string().uuid("Bot inválido"),
    title: z.string().min(1, "Título é obrigatório").max(255, "Título muito longo"),
    description: z.string().optional().nullable(),
    type: z.enum(["image", "video", "file", "bundle"]),
    originalKey: z.string().min(1),
    deliveryMode: z.enum(["ondemand", "catalog"]),
    price: z.coerce.number().min(0).optional(),
    scheduledAt: z.coerce.date().optional().nullable(),
  })
  .refine(
    (d) => d.deliveryMode === "catalog" || (d.price !== undefined && d.price > 0),
    { message: "Defina um preço maior que R$ 0,00", path: ["price"] }
  )
  .refine(
    (d) => !d.scheduledAt || d.scheduledAt.getTime() > Date.now() + 60_000,
    { message: "Escolha um horário pelo menos 1 minuto no futuro", path: ["scheduledAt"] }
  );

export const reschedulePublishSchema = z.object({
  scheduledAt: z.coerce.date().refine(
    (d) => d.getTime() > Date.now() + 60_000,
    "Escolha um horário pelo menos 1 minuto no futuro"
  ),
});

export const presignedUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  botId: z.string().uuid(),
});

export const createUserWithBotSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  botName: z.string().min(2, "Nome do bot deve ter pelo menos 2 caracteres"),
  botToken: z.string().min(10, "Token do bot inválido"),
  botDescription: z.string().optional(),
});

// Para cpf/phone/pixKey: ausente (undefined) = não alterar; null = limpar; string = validar.
const optionalCpf = z.union([z.null(), cpfSchema]).optional();
const optionalPhone = z.union([z.null(), phoneBrSchema]).optional();

export const updateUserSchema = z
  .object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    role: z.enum(["owner", "admin", "manager", "creator"]).optional(),
    isActive: z.boolean().optional(),
    platformFeePercent: z.coerce.number().min(0).max(100).optional(),
    managerFeePercent: z.coerce.number().min(0).max(100).nullable().optional(),
    managedByUserId: z.string().uuid().nullable().optional(),
    cpf: optionalCpf,
    phone: optionalPhone,
    // Chave Pix e tipo andam em par: ambos presentes pra setar, ambos null pra limpar.
    pixKey: z.union([z.null(), z.string().trim().min(1)]).optional(),
    pixKeyType: z
      .union([z.null(), z.enum(["cpf", "cnpj", "email", "phone", "random"])])
      .optional(),
  })
  .superRefine((d, ctx) => {
    const keyPresent = d.pixKey !== undefined;
    const typePresent = d.pixKeyType !== undefined;
    if (keyPresent !== typePresent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Envie chave Pix e tipo juntos (ou ambos null para limpar).",
        path: ["pixKey"],
      });
      return;
    }
    if (!keyPresent) return;
    const bothNull = d.pixKey === null && d.pixKeyType === null;
    const bothSet = d.pixKey !== null && d.pixKeyType !== null;
    if (!bothNull && !bothSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Envie chave Pix e tipo juntos (ou ambos null para limpar).",
        path: ["pixKey"],
      });
      return;
    }
    if (bothSet) {
      const parsed = pixKeyPairSchema.safeParse({
        pixKey: d.pixKey,
        pixKeyType: d.pixKeyType,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue(issue);
        }
      } else {
        // Substitui pela versão normalizada.
        d.pixKey = parsed.data.pixKey;
        d.pixKeyType = parsed.data.pixKeyType;
      }
    }
  });

// Self-service: usuário logado edita o próprio perfil.
// Campos de pagamento (cpf/phone/pixKey) só são validados aqui; a action
// garante que apenas creator/manager podem usá-los.
export const updateProfileSchema = updateUserSchema.innerType().pick({
  name: true,
  email: true,
  cpf: true,
  phone: true,
  pixKey: true,
  pixKeyType: true,
}).superRefine((d, ctx) => {
  const keyPresent = d.pixKey !== undefined;
  const typePresent = d.pixKeyType !== undefined;
  if (keyPresent !== typePresent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Envie chave Pix e tipo juntos (ou ambos null para limpar).",
      path: ["pixKey"],
    });
    return;
  }
  if (!keyPresent) return;
  const bothNull = d.pixKey === null && d.pixKeyType === null;
  const bothSet = d.pixKey !== null && d.pixKeyType !== null;
  if (!bothNull && !bothSet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Envie chave Pix e tipo juntos (ou ambos null para limpar).",
      path: ["pixKey"],
    });
    return;
  }
  if (bothSet) {
    const parsed = pixKeyPairSchema.safeParse({
      pixKey: d.pixKey,
      pixKeyType: d.pixKeyType,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
    } else {
      d.pixKey = parsed.data.pixKey;
      d.pixKeyType = parsed.data.pixKeyType;
    }
  }
});

export const platformSettingsSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
  isEncrypted: z.boolean().optional().default(false),
});

export const storageSettingsSchema = z.object({
  provider: z.enum(["s3", "wasabi"]),
  bucket: z.string().min(1, "Bucket é obrigatório"),
  region: z.string().min(1, "Região é obrigatória"),
  endpoint: z.string().optional(),
  accessKeyId: z.string().min(1, "Access Key é obrigatório"),
  secretAccessKey: z.string().min(1, "Secret Key é obrigatório"),
});

// accessToken/webhookSecret undefined = "não tocar" (preserva valor existente).
// String vazia também é tratada como não tocar (caller mascarou o campo).
export const pixSettingsSchema = z.object({
  provider: z.enum(["mercadopago", "efipay", "asaas", "woovi", "mock"]),
  accessToken: z.string().optional(),
  webhookSecret: z.string().optional(),
});

// Mensagem de boas-vindas
export const welcomeMessageSchema = z.object({
  text: z.string().min(1, "Mensagem é obrigatória").max(4096, "Mensagem muito longa (máx. 4096 caracteres)"),
  mediaType: z.enum(["image", "video"]).nullable().optional(),
  mediaKey: z.string().nullable().optional(),
  buttons: z.array(z.object({
    text: z.string().min(1, "Texto do botão é obrigatório").max(64, "Texto muito longo"),
    action: z.string().min(1, "Ação é obrigatória"),
  })).max(6, "Máximo de 6 botões").optional().default([]),
  sendOnEveryStart: z.boolean().optional().default(true),
});

// Plano de assinatura — duração em dias. Presets comuns em DURATION_PRESETS
// (src/lib/subscription.ts), mas qualquer valor entre 1 e 400 é aceito.
const durationDaysSchema = z.coerce
  .number()
  .int("Duração deve ser inteira")
  .min(1, "Duração mínima de 1 dia")
  .max(400, "Duração máxima de 400 dias");

export const createSubscriptionPlanSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  description: z.string().optional(),
  price: z.coerce.number().min(0.01, "Preço deve ser maior que R$ 0,01"),
  durationDays: durationDaysSchema,
  benefits: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  includesLiveAccess: z.boolean().optional(),
});

export const updateSubscriptionPlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0.01).optional(),
  durationDays: durationDaysSchema.optional(),
  benefits: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  includesLiveAccess: z.boolean().optional(),
});

// Live streaming
export const liveStreamSchema = z.object({
  isLive: z.boolean(),
  title: z.string().max(255, "Título muito longo").optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Preço não pode ser negativo").default(0),
  notifySubscribers: z.boolean().optional().default(false),
});

// Agendamento de live — toda live passa por aqui.
export const createLiveScheduleSchema = z
  .object({
    botId: z.string().uuid("Bot inválido"),
    title: z
      .string()
      .min(1, "Título é obrigatório")
      .max(255, "Título muito longo"),
    description: z.string().optional().nullable(),
    price: z.coerce.number().min(0, "Preço não pode ser negativo").default(0),
    notifySubscribers: z.boolean().optional().default(false),
    startAt: z.coerce.date({ errorMap: () => ({ message: "Data de início inválida" }) }),
    endAt: z.coerce.date({ errorMap: () => ({ message: "Data de término inválida" }) }),
  })
  .refine((d) => d.endAt > d.startAt, {
    message: "Término deve ser depois do início",
    path: ["endAt"],
  });

export const updateLiveScheduleSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),
    price: z.coerce.number().min(0).optional(),
    notifySubscribers: z.boolean().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
  })
  .refine(
    (d) => !d.startAt || !d.endAt || d.endAt > d.startAt,
    { message: "Término deve ser depois do início", path: ["endAt"] }
  );

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  ENCRYPTION_SECRET: z.string().min(32),
  REDIS_URL: z.string().optional().default("redis://localhost:6379"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserWithBotInput = z.infer<typeof createUserWithBotSchema>;
export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotInput = z.infer<typeof updateBotSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type PublishContentInput = z.infer<typeof publishContentSchema>;
export type ReschedulePublishInput = z.infer<typeof reschedulePublishSchema>;
export type PresignedUrlInput = z.infer<typeof presignedUrlSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type StorageSettingsInput = z.infer<typeof storageSettingsSchema>;
export type PixSettingsInput = z.infer<typeof pixSettingsSchema>;
export type WelcomeMessageInput = z.infer<typeof welcomeMessageSchema>;
export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;
export type UpdateSubscriptionPlanInput = z.infer<typeof updateSubscriptionPlanSchema>;
export type LiveStreamInput = z.infer<typeof liveStreamSchema>;
export type CreateLiveScheduleInput = z.infer<typeof createLiveScheduleSchema>;
export type UpdateLiveScheduleInput = z.infer<typeof updateLiveScheduleSchema>;
