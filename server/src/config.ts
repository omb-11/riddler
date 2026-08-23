import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
const serverEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");

const rootEnv = dotenv.config({ path: rootEnvPath });
const serverEnv = dotenv.config({ path: serverEnvPath });

if (rootEnv.parsed?.DATABASE_URL) {
  process.env.DATABASE_URL = rootEnv.parsed.DATABASE_URL;
}
if (rootEnv.parsed?.SESSION_SECRET) {
  process.env.SESSION_SECRET = rootEnv.parsed.SESSION_SECRET;
}
if (!process.env.APP_ENV && serverEnv.parsed?.APP_ENV) {
  process.env.APP_ENV = serverEnv.parsed.APP_ENV;
}

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const config = {
  appEnv: (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase(),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDevelopment: (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase() !== "production",
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: getEnv("DATABASE_URL"),
  sessionSecret: getEnv("SESSION_SECRET"),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120)
};
