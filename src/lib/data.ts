import { db } from "./db";
import { withSchema } from "./schema";
import type { Ticket } from "./reparto";
import { addDays, weekDates, type Cell, type Settings, type Staff, type StaffType } from "./turnos";

type StaffRow = { id: number; name: string; type: StaffType; days_off: number[]; daily_wage: number; pos_name: string | null };
type TicketRow = { waiter: string; billed: string; tip: number };
type ShiftRow = { staff_id: number; work_date: string; status: "full" | "from"; start_time: string | null };
type SettingRow = { key: string; value: string };

export async function loadWeek(monday: string) {
  return withSchema(() => queryWeek(monday));
}

async function queryWeek(monday: string) {
  const sql = db();
  const sunday = addDays(monday, 6);
  const settingRows = (await sql`select key, value from settings`) as SettingRow[];
  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const settings: Settings = {
    open: s.open ?? "07:00",
    cutoff: s.cutoff ?? "05:00",
    sharedCodes: parseCodes(s.shared_codes),
  };

  // Cuentas del lunes a la hora de corte hasta el lunes siguiente a la hora de corte:
  // la madrugada del lunes es del domingo anterior y la del lunes siguiente es de este domingo.
  const from = `${monday} ${settings.cutoff}:00`;
  const to = `${addDays(monday, 7)} ${settings.cutoff}:00`;

  const [staffRows, shiftRows, ticketRows] = (await Promise.all([
    sql`select id, name, type, days_off, daily_wage, pos_name from staff where active order by
          case type when 'fijo' then 0 when 'ocasional' then 1 else 2 end, name`,
    sql`select staff_id, to_char(work_date, 'YYYY-MM-DD') as work_date, status,
          to_char(start_time, 'HH24:MI') as start_time
        from shifts where work_date between ${monday} and ${sunday}`,
    sql`select waiter, to_char(billed_at, 'YYYY-MM-DD HH24:MI') as billed, tip_total::float8 as tip
        from tickets where billed_at >= ${from}::timestamp and billed_at < ${to}::timestamp
        order by billed_at`,
  ])) as [StaffRow[], ShiftRow[], TicketRow[]];

  const staff: Staff[] = staffRows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    daysOff: (r.days_off ?? []).map(Number),
    dailyWage: Number(r.daily_wage),
    posName: r.pos_name,
  }));

  const dates = weekDates(monday);
  const sched: Record<number, Cell[]> = {};
  for (const p of staff) sched[p.id] = dates.map(() => ({ s: "off" }));
  for (const r of shiftRows) {
    const i = dates.indexOf(r.work_date);
    if (i < 0 || !sched[r.staff_id]) continue;
    sched[r.staff_id][i] = r.status === "from" ? { s: "from", t: r.start_time ?? "07:00" } : { s: "full" };
  }

  const tickets: Ticket[] = ticketRows.map((r) => ({
    date: r.billed.slice(0, 10),
    time: r.billed.slice(11, 16),
    tip: r.tip,
    waiter: r.waiter,
  }));

  return { staff, sched, settings, tickets };
}

function parseCodes(v: string | undefined): string[] {
  try {
    const x = JSON.parse(v ?? "[]");
    return Array.isArray(x) ? x.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}
