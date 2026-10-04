"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, requireAuth, startSession } from "@/lib/auth";
import { HHMM, ISO_DATE, addDays, type Cell, type Staff, type StaffType } from "@/lib/turnos";

const STAFF_TYPES: StaffType[] = ["fijo", "ocasional", "propietario"];

function checkCell(c: Cell) {
  if (c.s === "from" ? !c.t || !HHMM.test(c.t) : c.s !== "full" && c.s !== "off") {
    throw new Error("Dato de turno inválido.");
  }
}

function checkStaffInput(name: string, type: StaffType, daysOff: number[]) {
  const clean = name.trim();
  if (!clean || clean.length > 60) throw new Error("Escriba un nombre (máximo 60 letras).");
  if (!STAFF_TYPES.includes(type)) throw new Error("Tipo de persona inválido.");
  if (!daysOff.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw new Error("Días libres inválidos.");
  return clean;
}

/** Guarda un día de una persona. Libre borra la fila. */
export async function saveShift(staffId: number, date: string, cell: Cell) {
  await requireAuth();
  if (!ISO_DATE.test(date)) throw new Error("Fecha inválida.");
  checkCell(cell);
  const sql = db();
  if (cell.s === "off") {
    await sql`delete from shifts where staff_id = ${staffId} and work_date = ${date}`;
  } else {
    const time = cell.s === "from" ? cell.t! : null;
    await sql`insert into shifts (staff_id, work_date, status, start_time)
              values (${staffId}, ${date}, ${cell.s}, ${time})
              on conflict (staff_id, work_date)
              do update set status = excluded.status, start_time = excluded.start_time, updated_at = now()`;
  }
}

/** Guarda los 7 días de una persona de una vez (botones rápidos). */
export async function saveStaffWeek(staffId: number, monday: string, cells: Cell[]) {
  await requireAuth();
  if (!ISO_DATE.test(monday) || cells.length !== 7) throw new Error("Semana inválida.");
  cells.forEach(checkCell);
  const sql = db();
  await sql.transaction(
    cells.map((c, i) => {
      const date = addDays(monday, i);
      return c.s === "off"
        ? sql`delete from shifts where staff_id = ${staffId} and work_date = ${date}`
        : sql`insert into shifts (staff_id, work_date, status, start_time)
              values (${staffId}, ${date}, ${c.s}, ${c.s === "from" ? c.t! : null})
              on conflict (staff_id, work_date)
              do update set status = excluded.status, start_time = excluded.start_time, updated_at = now()`;
    }),
  );
}

export async function addStaff(name: string, type: StaffType, daysOff: number[]): Promise<Staff> {
  await requireAuth();
  const clean = checkStaffInput(name, type, daysOff);
  const rows = (await db()`insert into staff (name, type, days_off)
    values (${clean}, ${type}, ${daysOff}) returning id`) as { id: number }[];
  return { id: rows[0].id, name: clean, type, daysOff };
}

export async function updateStaff(id: number, name: string, type: StaffType, daysOff: number[]) {
  await requireAuth();
  const clean = checkStaffInput(name, type, daysOff);
  await db()`update staff set name = ${clean}, type = ${type}, days_off = ${daysOff} where id = ${id}`;
}

/** Quita a la persona de la lista sin borrar su historial. */
export async function deactivateStaff(id: number) {
  await requireAuth();
  await db()`update staff set active = false where id = ${id}`;
}

export async function saveSettings(open: string, cutoff: string) {
  await requireAuth();
  if (!HHMM.test(open) || !HHMM.test(cutoff)) throw new Error("Hora inválida.");
  const sql = db();
  await sql.transaction([
    sql`insert into settings (key, value) values ('open', ${open}) on conflict (key) do update set value = excluded.value`,
    sql`insert into settings (key, value) values ('cutoff', ${cutoff}) on conflict (key) do update set value = excluded.value`,
  ]);
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  if (!process.env.APP_PASSWORD) return "Falta configurar APP_PASSWORD en Vercel.";
  const ok = await startSession(String(form.get("password") ?? ""));
  if (!ok) return "Contraseña incorrecta.";
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
