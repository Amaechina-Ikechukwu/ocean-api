import { z } from "zod";

const envSchema = z.object({
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
  FIREBASE_REALTIME_DATABASE_URL: z.string().url().optional(),
  CLIENT_URL: z.string().url(),
  NVIDIA_API_KEY: z.string().min(1).optional(),
  NVIDIA_AI_MODEL: z.string().min(1).default("google/gemma-4-31b-it"),
  NVIDIA_AI_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1/chat/completions"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-2"),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300)
}).superRefine((value, ctx) => {
  if (value.FIREBASE_SERVICE_ACCOUNT_JSON || value.FIREBASE_SERVICE_ACCOUNT_PATH) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Set FIREBASE_SERVICE_ACCOUNT_JSON for Cloud Run or FIREBASE_SERVICE_ACCOUNT_PATH for local development",
    path: ["FIREBASE_SERVICE_ACCOUNT_JSON"]
  });
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
