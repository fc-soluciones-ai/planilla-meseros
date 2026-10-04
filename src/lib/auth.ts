import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "pm_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 días: la dueña no tiene que entrar cada vez

const hash = (s: string) => createHash("sha256").update("planilla-meseros:" + s).digest();

function expected(): Buffer {
  const pass = process.env.APP_PASSWORD;
  if (!pass) throw new Error("Falta APP_PASSWORD en las variables de entorno.");
  return hash(pass);
}

export async function isLoggedIn(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value || !/^[0-9a-f]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, "hex"), expected());
}

/** Se llama al inicio de cada acción del servidor: son accesibles por POST directo. */
export async function requireAuth(): Promise<void> {
  if (!(await isLoggedIn())) throw new Error("Sesión vencida. Vuelva a entrar.");
}

export async function startSession(password: string): Promise<boolean> {
  if (!timingSafeEqual(hash(password), expected())) return false;
  (await cookies()).set(COOKIE, expected().toString("hex"), {
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
