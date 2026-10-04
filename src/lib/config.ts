import { databaseUrl } from "./db";

/** Variables de entorno que faltan en Vercel (solo nombres, nunca valores). */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.APP_PASSWORD) missing.push("APP_PASSWORD");
  if (!databaseUrl()) missing.push("DATABASE_URL");
  return missing;
}
