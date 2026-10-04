import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

/** Conexión a Postgres (Neon). Se crea al primer uso para que el build no exija DATABASE_URL. */
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL. Conecte la base Neon en Vercel → Storage.");
    client = neon(url);
  }
  return client;
}
