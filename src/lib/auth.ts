import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";
import { withSchema } from "./schema";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const COOKIE = "pm_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 días: no hay que entrar cada vez

/** Usuario administrador: entra con el usuario "admin" y la contraseña APP_PASSWORD de Vercel. */
export const ADMIN_USERNAME = "admin";

export type Session = { userId: number; name: string; username: string };

function appPassword(): string {
  const pass = process.env.APP_PASSWORD;
  if (!pass) throw new Error("Falta APP_PASSWORD en las variables de entorno.");
  return pass;
}

// La firma de la sesión depende de APP_PASSWORD: si se cambia en Vercel, todas las sesiones se cierran.
const signKey = () => createHash("sha256").update("planilla-meseros:session:" + appPassword()).digest();
const sign = (payload: string) => createHmac("sha256", signKey()).update(payload).digest("base64url");

const sameText = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = await scryptAsync(password, Buffer.from(salt, "base64url"), 32);
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

type UserRow = { id: number; name: string; username: string; password_hash: string };

/** Sesión actual, o null. Revisa que el usuario siga existiendo. */
export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  const [uid, exp, sig] = value?.split(".") ?? [];
  if (!uid || !exp || !sig || !/^\d+$/.test(uid) || !/^\d+$/.test(exp)) return null;
  if (!sameText(sig, sign(`${uid}.${exp}`)) || Number(exp) < Date.now() / 1000) return null;
  if (uid === "0") return { userId: 0, name: "Administrador", username: ADMIN_USERNAME };
  const rows = (await withSchema(() => db()`select id, name, username from users where id = ${Number(uid)}`)) as UserRow[];
  return rows[0] ? { userId: rows[0].id, name: rows[0].name, username: rows[0].username } : null;
}

export async function isLoggedIn(): Promise<boolean> {
  return (await getSession()) !== null;
}

/** Se llama al inicio de cada acción del servidor: son accesibles por POST directo. */
export async function requireAuth(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Sesión vencida. Vuelva a entrar.");
  return s;
}

/** Valida usuario y contraseña y abre la sesión. */
export async function startSession(username: string, password: string): Promise<boolean> {
  const user = username.trim().toLowerCase();
  let uid: number | null = null;
  if (user === ADMIN_USERNAME) {
    if (sameText(password, appPassword())) uid = 0;
  } else if (user) {
    const rows = (await withSchema(() => db()`select id, password_hash from users where username = ${user}`)) as UserRow[];
    if (rows[0] && (await checkPassword(password, rows[0].password_hash))) uid = rows[0].id;
  }
  if (uid === null) return false;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  (await cookies()).set(COOKIE, `${uid}.${exp}.${sign(`${uid}.${exp}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
