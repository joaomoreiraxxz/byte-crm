import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/postgres'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().default('4a7c8d9b2e1f3a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b'),
  JWT_REFRESH_SECRET: z.string().default('9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // CSRF
  CSRF_SECRET: z.string().default('5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e'),

  // Audit Encryption (AES-256 key = 32 bytes = 64 hex chars)
  AUDIT_ENCRYPTION_KEY: z.string().default('1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b'),

  // Vault
  VAULT_MASTER_SALT: z.string().default('3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c'),

  // Biometric Service
  BIOMETRIC_SERVICE_URL: z.string().default('http://localhost:8000'),
  BIOMETRIC_API_KEY: z.string().default('chave_biometria_bytecrm_2026_secreta'),

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('https://app.bytecrm.online'),

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
