import { z } from 'zod'

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

const normalizeEnvString = (value: unknown) => {
  if (value === undefined || value === null) return value
  const text = String(value).trim()
  const hasMatchingQuotes =
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))

  return hasMatchingQuotes ? text.slice(1, -1) : text
}

const normalizeNumber = (value: unknown) => {
  if (value === undefined) return value
  return Number(normalizeEnvString(value))
}

const envSchema = z.object({
  NODE_ENV: z.preprocess(normalizeEnvString, z.nativeEnum(NodeEnv)),
  DATABASE_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  JWT_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)),
  JWT_EXPIRES_IN: z.preprocess(normalizeEnvString, z.string().min(1)).default('15m'),
  JWT_REFRESH_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)),
  JWT_REFRESH_EXPIRES_IN: z.preprocess(normalizeEnvString, z.string().min(1)).default('7d'),
  PORT: z.preprocess(normalizeNumber, z.number().int().positive()).default(3001),
  API_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  NEXT_PUBLIC_API_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  CORS_ORIGINS: z.preprocess(normalizeEnvString, z.string()).optional(),
  CORS_ALLOW_NULL_ORIGIN: z.preprocess(
    (value) => (value === undefined ? undefined : String(normalizeEnvString(value)).toLowerCase()),
    z.enum(['true', 'false']).optional(),
  ),
  REFRESH_COOKIE_NAME: z.preprocess(normalizeEnvString, z.string()).optional(),
  REFRESH_COOKIE_DOMAIN: z.preprocess(normalizeEnvString, z.string()).optional(),
  REFRESH_COOKIE_SAMESITE: z.preprocess(
    (value) => (value === undefined ? undefined : String(normalizeEnvString(value)).toLowerCase()),
    z.enum(['lax', 'strict', 'none']).optional(),
  ),
  LOG_LEVEL: z.preprocess(normalizeEnvString, z.string()).optional(),
  LOG_DIR: z.preprocess(normalizeEnvString, z.string()).optional(),
  PASSWORD_SALT_ROUNDS: z.preprocess(normalizeNumber, z.number().int().positive()).default(12),
  PASSWORD_PEPPER: z.preprocess(normalizeEnvString, z.string()).optional(),
  OTP_TTL_MINUTES: z.preprocess(normalizeNumber, z.number().int().positive()).default(10),
  REDIS_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  INVITE_TTL_DAYS: z.preprocess(normalizeNumber, z.number().int().positive()).default(7),
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
