"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, requireAuth, startSession } from "@/lib/auth";
import { withSchema } from "@/lib/schema";
import { HHMM, ISO_DATE, addDays, type Cell, type Staff, type StaffType } from "@/lib/turnos";
import { parseVentas } from "@/lib/ventas";

const STAFF_TYPES: StaffType[] = ["fijo", "ocasional", "propietario"];

function checkCell(c: Cell) {
  if (c.s === "from" ? !c.t || !HHMM.test(c.t) : c.s !== "full" && c.s !== "off") {
    throw new Error("Dato de turno inválido.");
  }
}

export type StaffInput = Pick<Staff, "name" | "type" | "daysOff" | "dailyWage" | "posName">;

function checkStaffInput(p: StaffInput): StaffInput {
  const name = p.name.trim();
  const posName = p.posName?.trim() || null;
  if (!name || name.length > 60) throw new Error("Escriba un nombre (máximo 60 letras).");
  if (!STAFF_TYPES.includes(p.type)) throw new Error("Tipo de persona inválido.");
  if (!p.daysOff.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw new Error("Días libres inválidos.");
  if (!Number.isInteger(p.dailyWage) || p.dailyWage < 0 || p.dailyWage > 1_000_000) throw new Error("Salario inválido.");
  if (posName && posName.length > 60) throw new Error("Nombre en el sistema muy largo.");
  return { ...p, name, posName };
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

export async function addStaff(input: StaffInput): Promise<Staff> {
  await requireAuth();
  const p = checkStaffInput(input);
  const rows = (await db()`insert into staff (name, type, days_off, daily_wage, pos_name)
    values (${p.name}, ${p.type}, ${p.daysOff}, ${p.dailyWage}, ${p.posName}) returning id`) as { id: number }[];
  return { id: rows[0].id, ...p };
}

export async function updateStaff(id: number, input: StaffInput) {
  await requireAuth();
  const p = checkStaffInput(input);
  await db()`update staff set name = ${p.name}, type = ${p.type}, days_off = ${p.daysOff},
    daily_wage = ${p.dailyWage}, pos_name = ${p.posName} where id = ${id}`;
}

export type ImportResult =
  | { ok: true; total: number; added: number; updated: number; from: string; to: string; tips: number }
  | { ok: false; error: string };

/** Carga el archivo "Cuentas con propina" del sistema. Volver a subirlo no duplica: se identifica por folio. */
export async function importVentas(form: FormData): Promise<ImportResult> {
  await requireAuth();
  const file = form.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Escoja el archivo de ventas." };
  try {
    const rows = await parseVentas(await file.arrayBuffer());
    const result = (await withSchema(() => db().query(
      `insert into tickets (folio, waiter, billed_at, amount, tip_cash, tip_vouchers, tip_other, tip_card,
                            commission, commission_tax, tip_total)
       select folio, waiter, billed_at, amount, tip_cash, tip_vouchers, tip_other, tip_card,
              commission, commission_tax, tip_total
       from json_to_recordset($1::json) as t(folio bigint, waiter text, billed_at timestamp, amount numeric,
         tip_cash numeric, tip_vouchers numeric, tip_other numeric, tip_card numeric, commission numeric,
         commission_tax numeric, tip_total numeric)
       on conflict (folio) do update set
         waiter = excluded.waiter, billed_at = excluded.billed_at, amount = excluded.amount,
         tip_cash = excluded.tip_cash, tip_vouchers = excluded.tip_vouchers, tip_other = excluded.tip_other,
         tip_card = excluded.tip_card, commission = excluded.commission,
         commission_tax = excluded.commission_tax, tip_total = excluded.tip_total, imported_at = now()
       returning (xmax = 0) as inserted`,
      [JSON.stringify(rows)],
    ))) as { inserted: boolean }[];
    const added = result.filter((r) => r.inserted).length;
    const dates = rows.map((r) => r.billed_at).sort();
    return {
      ok: true,
      total: rows.length,
      added,
      updated: rows.length - added,
      from: dates[0],
      to: dates[dates.length - 1],
      tips: rows.reduce((a, r) => a + r.tip_total, 0),
    };
  } catch (e) {
    console.error("importVentas", e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cargar el archivo." };
  }
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

/** Códigos compartidos del sistema (ej. "ELENA"): su propina entra al reparto sin generar aviso. */
export async function saveSharedCodes(codes: string[]) {
  await requireAuth();
  const clean = [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  if (clean.length > 50 || clean.some((c) => c.length > 60)) throw new Error("Códigos inválidos.");
  await db()`insert into settings (key, value) values ('shared_codes', ${JSON.stringify(clean)})
             on conflict (key) do update set value = excluded.value`;
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
