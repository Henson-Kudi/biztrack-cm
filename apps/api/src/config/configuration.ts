import { z } from 'zod'

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

const envSchema = z.object({
  NODE_ENV: z.nativeEnum(NodeEnv),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  API_PORT: z.preprocess((value) => Number(value), z.number().int().positive()).default(3001),
  API_URL: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.string().min(1),
  CORS_ORIGINS: z.string().optional(),
  CORS_ALLOW_NULL_ORIGIN: z.preprocess(
    (value) => (value === undefined ? undefined : String(value).toLowerCase()),
    z.enum(['true', 'false']).optional(),
  ),
  REFRESH_COOKIE_NAME: z.string().optional(),
  REFRESH_COOKIE_DOMAIN: z.string().optional(),
  REFRESH_COOKIE_SAMESITE: z.preprocess(
    (value) => (value === undefined ? undefined : String(value).toLowerCase()),
    z.enum(['lax', 'strict', 'none']).optional(),
  ),
  LOG_LEVEL: z.string().optional(),
  LOG_DIR: z.string().optional(),
  PASSWORD_SALT_ROUNDS: z.preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().int().positive()).default(12),
  PASSWORD_PEPPER: z.string().optional(),
  OTP_TTL_MINUTES: z.preprocess((value) => Number(value), z.number().int().positive()).default(10),
  REDIS_URL: z.string().min(1),
  INVITE_TTL_DAYS: z.preprocess((value) => Number(value), z.number().int().positive()).default(7),
})

export type AppConfig = z.infer<typeof envSchema>

export const validateEnv = (config: Record<string, unknown>): AppConfig => {
  const parsed = envSchema.safeParse(config)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${message}`)
  }
  return parsed.data
}
