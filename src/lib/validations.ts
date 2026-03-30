import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não conferem",
  path: ["confirmPassword"],
});

export const createBotSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  telegramToken: z.string().min(10, "Token inválido"),
  description: z.string().optional(),
  welcomeMessage: z.string().optional(),
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
  price: z.coerce.number().min(0.01, "Preço deve ser maior que R$ 0,01"),
  originalKey: z.string().min(1),
  isPublished: z.boolean().optional().default(false),
});

export const updateContentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0.01).optional(),
  isPublished: z.boolean().optional(),
});

export const presignedUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  botId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["owner", "admin", "creator"]).optional(),
  isActive: z.boolean().optional(),
  platformFeePercent: z.coerce.number().min(0).max(100).optional(),
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
  publicBaseUrl: z.string().optional(),
});

export const pixSettingsSchema = z.object({
  provider: z.enum(["mercadopago", "efipay", "asaas"]),
  accessToken: z.string().min(1, "Token é obrigatório"),
  webhookSecret: z.string().optional(),
});

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  ENCRYPTION_SECRET: z.string().min(32),
  REDIS_URL: z.string().optional().default("redis://localhost:6379"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotInput = z.infer<typeof updateBotSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type PresignedUrlInput = z.infer<typeof presignedUrlSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type StorageSettingsInput = z.infer<typeof storageSettingsSchema>;
export type PixSettingsInput = z.infer<typeof pixSettingsSchema>;
