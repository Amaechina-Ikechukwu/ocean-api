import { z } from "zod";

const envSchema = z.object({
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1),
  FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
  FIREBASE_REALTIME_DATABASE_URL: z.string().url().optional(),
  CLIENT_URL: z.string().url(),
  NVIDIA_API_KEY: z.string().min(1).optional(),
  NVIDIA_AI_MODEL: z.string().min(1).default("google/gemma-4-31b-it"),
  NVIDIA_AI_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1/chat/completions"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-2"),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().max(2048).default(1536),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
  LOG_BUFFER_SIZE: z.coerce.number().int().positive().max(5000).default(500),
  LOG_VIEWER_TOKEN: z.string().min(24).optional()
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
