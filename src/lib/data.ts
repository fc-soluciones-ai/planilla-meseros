import { db } from "./db";
import { SCHEMA_VERSION, ensureSchema, withSchema } from "./schema";
import type { Ticket } from "./reparto";
import { addDays, defaultCell, weekDates, type Cell, type Settings, type Staff, type StaffType } from "./turnos";

type StaffRow = { id: number; name: string; type: StaffType; days_off: number[]; daily_wage: number };
type TicketRow = { billed: string; tip: number };
type ShiftRow = { staff_id: number; work_date: string; status: "full" | "from" | "off"; start_time: string | null };
type SettingRow = { key: string; value: string };

export async function loadWeek(monday: string) {
  return withSchema(() => queryWeek(monday));
}

async function queryWeek(monday: string) {
  const sql = db();
  const sunday = addDays(monday, 6);
  const settingRows = (await sql`select key, value from settings`) as SettingRow[];
  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  if (s.schema_version !== SCHEMA_VERSION) await ensureSchema(); // base de una versión anterior
  const settings: Settings = {
    open: s.open ?? "07:00",
    cutoff: s.cutoff ?? "05:00",
    restaurant: s.restaurant ?? "",
  };

  // Cuentas del lunes a la hora de corte hasta el lunes siguiente a la hora de corte:
  // la madrugada del lunes es del domingo anterior y la del lunes siguiente es de este domingo.
  const from = `${monday} ${settings.cutoff}:00`;
  const to = `${addDays(monday, 7)} ${settings.cutoff}:00`;

  const [staffRows, shiftRows, ticketRows] = (await Promise.all([
    sql`select id, name, type, days_off, daily_wage from staff where active order by
          case type when 'fijo' then 0 when 'ocasional' then 1 else 2 end, name`,
    sql`select staff_id, to_char(work_date, 'YYYY-MM-DD') as work_date, status,
          to_char(start_time, 'HH24:MI') as start_time
        from shifts where work_date between ${monday} and ${sunday}`,
    sql`select to_char(billed_at, 'YYYY-MM-DD HH24:MI') as billed, tip_total::float8 as tip
        from tickets where billed_at >= ${from}::timestamp and billed_at < ${to}::timestamp
        order by billed_at`,
  ])) as [StaffRow[], ShiftRow[], TicketRow[]];

  const staff: Staff[] = staffRows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    daysOff: (r.days_off ?? []).map(Number),
    dailyWage: Number(r.daily_wage),
  }));

  const dates = weekDates(monday);
  const sched: Record<number, Cell[]> = {};
  // Lo que no se ha tocado sale con el valor por defecto de cada persona
  for (const p of staff) sched[p.id] = dates.map((_, d) => defaultCell(p, d));
  for (const r of shiftRows) {
    const i = dates.indexOf(r.work_date);
    if (i < 0 || !sched[r.staff_id]) continue;
    sched[r.staff_id][i] =
      r.status === "from" ? { s: "from", t: r.start_time ?? "07:00" } : r.status === "full" ? { s: "full" } : { s: "off" };
  }

  const tickets: Ticket[] = ticketRows.map((r) => ({
    date: r.billed.slice(0, 10),
    time: r.billed.slice(11, 16),
    tip: r.tip,
  }));

  return { staff, sched, settings, tickets };
}

export type AppUser = { id: number; name: string; username: string };

export async function loadUsers(): Promise<AppUser[]> {
  return (await withSchema(() => db()`select id, name, username from users order by name`)) as AppUser[];
}
