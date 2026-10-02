import { z } from "zod";

/**
 * Validation centralisée des variables d'environnement (côté serveur uniquement).
 * Aucune variable secrète n'est préfixée NEXT_PUBLIC_ : elles ne quittent jamais le serveur.
 */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const booleanString = (def: boolean) =>
  z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()).transform((v) => (v === undefined ? def : v === "true"));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL est obligatoire"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit contenir au moins 32 caractères"),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY doit être 32 octets encodés en base64"),
  ALLOW_REGISTRATION: booleanString(true),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  IMPORT_MAX_FILE_MB: z.coerce.number().positive().max(50).default(5),
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["none", "anthropic", "openai"]).default("none")),
  ANTHROPIC_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  AI_MODEL: optionalString,
  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  INSTAGRAM_REDIRECT_URI: optionalString,
  TIKTOK_CLIENT_KEY: optionalString,
  TIKTOK_CLIENT_SECRET: optionalString,
  TIKTOK_REDIRECT_URI: optionalString,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration invalide (.env) :\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Réinitialise le cache (tests uniquement). */
export function resetEnvCache() {
  cached = null;
}
