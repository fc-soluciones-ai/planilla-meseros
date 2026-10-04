"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_USERNAME, endSession, hashPassword, requireAuth, startSession } from "@/lib/auth";
import { withSchema } from "@/lib/schema";
import { HHMM, ISO_DATE, addDays, mondayOf, turnDate, type Cell, type Staff, type StaffType } from "@/lib/turnos";
import { parseVentas } from "@/lib/ventas";

const STAFF_TYPES: StaffType[] = ["fijo", "ocasional", "propietario"];

function checkCell(c: Cell) {
  if (c.s === "from" ? !c.t || !HHMM.test(c.t) : c.s !== "full" && c.s !== "off") {
    throw new Error("Dato de turno inválido.");
  }
}

export type StaffInput = Pick<Staff, "name" | "type" | "daysOff" | "dailyWage">;

function checkStaffInput(p: StaffInput): StaffInput {
  const name = p.name.trim();
  if (!name || name.length > 60) throw new Error("Escriba un nombre (máximo 60 letras).");
  if (!STAFF_TYPES.includes(p.type)) throw new Error("Tipo de persona inválido.");
  if (!p.daysOff.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw new Error("Días libres inválidos.");
  if (!Number.isInteger(p.dailyWage) || p.dailyWage < 0 || p.dailyWage > 1_000_000) throw new Error("Salario inválido.");
  return { ...p, name };
}

const upsertShift = (sql: ReturnType<typeof db>, staffId: number, date: string, c: Cell) =>
  sql`insert into shifts (staff_id, work_date, status, start_time)
      values (${staffId}, ${date}, ${c.s}, ${c.s === "from" ? c.t! : null})
      on conflict (staff_id, work_date)
      do update set status = excluded.status, start_time = excluded.start_time, updated_at = now()`;

/** Guarda un día de una persona. Libre también se guarda, para que no vuelva al valor por defecto. */
export async function saveShift(staffId: number, date: string, cell: Cell) {
  await requireAuth();
  if (!ISO_DATE.test(date)) throw new Error("Fecha inválida.");
  checkCell(cell);
  await upsertShift(db(), staffId, date, cell);
}

export async function addStaff(input: StaffInput): Promise<Staff> {
  await requireAuth();
  const p = checkStaffInput(input);
  const rows = (await db()`insert into staff (name, type, days_off, daily_wage)
    values (${p.name}, ${p.type}, ${p.daysOff}, ${p.dailyWage}) returning id`) as { id: number }[];
  return { id: rows[0].id, ...p };
}

export async function updateStaff(id: number, input: StaffInput) {
  await requireAuth();
  const p = checkStaffInput(input);
  await db()`update staff set name = ${p.name}, type = ${p.type}, days_off = ${p.daysOff},
    daily_wage = ${p.dailyWage} where id = ${id}`;
}

/**
 * Al cargar las ventas, las semanas completas del archivo quedan fijas: los días que seguían por defecto
 * se guardan. Así, si después cambian los días libres de alguien, la planilla ya pagada no se mueve.
 */
async function freezeDefaults(firstBilled: string, lastBilled: string) {
  const sql = db();
  const [{ cutoff }] = (await sql`select coalesce((select value from settings where key = 'cutoff'), '05:00') as cutoff`) as { cutoff: string }[];
  const first = turnDate(firstBilled.slice(0, 10), firstBilled.slice(11, 16), cutoff);
  const last = turnDate(lastBilled.slice(0, 10), lastBilled.slice(11, 16), cutoff);
  // Primera semana que empieza dentro del archivo y última que termina dentro del archivo
  const from = mondayOf(first) === first ? first : addDays(mondayOf(first), 7);
  const to = addDays(mondayOf(addDays(last, 1)), -1);
  if (from > to) return;
  await sql`insert into shifts (staff_id, work_date, status)
    select s.id, d::date, case when (extract(isodow from d)::int - 1) = any(s.days_off) then 'off' else 'full' end
    from staff s cross join generate_series(${from}::date, ${to}::date, interval '1 day') d
    where s.active and s.type = 'fijo'
    on conflict (staff_id, work_date) do nothing`;
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
    await freezeDefaults(dates[0], dates[dates.length - 1]);
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

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  if (!process.env.APP_PASSWORD) return "Falta configurar APP_PASSWORD en Vercel.";
  const ok = await startSession(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return "Usuario o contraseña incorrectos.";
  redirect("/");
}

export type UserResult = { ok: true } | { ok: false; error: string };
const USERNAME = /^[a-z0-9._-]{3,30}$/;

function checkPassword(password: string): string | null {
  return password.length >= 6 && password.length <= 100 ? null : "La contraseña debe tener al menos 6 caracteres.";
}

/** Agrega un usuario que puede entrar a la app. */
export async function addUser(name: string, username: string, password: string): Promise<UserResult> {
  await requireAuth();
  const n = name.trim();
  const u = username.trim().toLowerCase();
  if (!n || n.length > 60) return { ok: false, error: "Escriba el nombre." };
  if (!USERNAME.test(u)) return { ok: false, error: "El usuario debe tener de 3 a 30 letras o números, sin espacios." };
  if (u === ADMIN_USERNAME) return { ok: false, error: "Ese usuario está reservado." };
  const bad = checkPassword(password);
  if (bad) return { ok: false, error: bad };
  try {
    await db()`insert into users (name, username, password_hash) values (${n}, ${u}, ${await hashPassword(password)})`;
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: `Ya existe el usuario "${u}".` };
    throw e;
  }
}

export async function changeUserPassword(id: number, password: string): Promise<UserResult> {
  await requireAuth();
  const bad = checkPassword(password);
  if (bad) return { ok: false, error: bad };
  await db()`update users set password_hash = ${await hashPassword(password)} where id = ${id}`;
  return { ok: true };
}

export async function deleteUser(id: number): Promise<UserResult> {
  const me = await requireAuth();
  if (me.userId === id) return { ok: false, error: "No puede quitarse a sí mismo mientras está dentro." };
  await db()`delete from users where id = ${id}`;
  return { ok: true };
}

export async function logout() {
  await endSession();
  redirect("/login");
}
