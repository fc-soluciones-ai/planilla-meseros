// Crea las tablas en la base de datos. Uso: npm run db:setup
// Necesita DATABASE_URL (en .env.local o en el entorno).
import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Ejecute `vercel env pull .env.local` primero.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync("db/schema.sql", "utf8")
  .replace(/--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const s of statements) await sql.query(s);
console.log(`Listo: ${statements.length} instrucciones aplicadas.`);
