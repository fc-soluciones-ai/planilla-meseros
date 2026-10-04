import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

/** Vercel crea DATABASE_URL al conectar Neon; POSTGRES_URL queda como respaldo. */
export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

/** Conexión a Postgres (Neon). Se crea al primer uso para que el build no exija la variable. */
export function db() {
  if (!client) {
    const url = databaseUrl();
    if (!url) throw new Error("Falta DATABASE_URL. Conecte la base Neon en Vercel → Storage.");
    client = neon(url);
  }
  return client;
}
