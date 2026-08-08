import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // CSRF
  CSRF_SECRET: z.string().min(16),

  // Audit Encryption (AES-256 key = 32 bytes = 64 hex chars)
  AUDIT_ENCRYPTION_KEY: z.string().min(64),

  // Vault
  VAULT_MASTER_SALT: z.string().min(16),

  // Biometric Service
  BIOMETRIC_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  BIOMETRIC_API_KEY: z.string().min(8),

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate Limiting
  RATE_LIMIT_GENERAL: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_AUTH: z.coerce.number().default(5),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(60000),

  // Brute Force Detection
  BRUTE_FORCE_MAX_ATTEMPTS: z.coerce.number().default(5),
  BRUTE_FORCE_WINDOW_MINUTES: z.coerce.number().default(15),
  BRUTE_FORCE_LOCKOUT_MINUTES: z.coerce.number().default(30),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  ✗ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error('╔══════════════════════════════════════════════╗');
    console.error('║   FATAL: Invalid environment configuration   ║');
    console.error('╚══════════════════════════════════════════════╝');
    console.error(formatted);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
