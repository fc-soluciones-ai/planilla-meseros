import { db } from "./db";
import { ensureSchema, isMissingTable } from "./schema";
import { addDays, weekDates, type Cell, type Settings, type Staff, type StaffType } from "./turnos";

type StaffRow = { id: number; name: string; type: StaffType; days_off: number[] };
type ShiftRow = { staff_id: number; work_date: string; status: "full" | "from"; start_time: string | null };
type SettingRow = { key: string; value: string };

export async function loadWeek(monday: string) {
  try {
    return await queryWeek(monday);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    await ensureSchema(); // primera vez: crea las tablas y vuelve a intentar
    return await queryWeek(monday);
  }
}

async function queryWeek(monday: string) {
  const sql = db();
  const sunday = addDays(monday, 6);
  const [staffRows, shiftRows, settingRows] = (await Promise.all([
    sql`select id, name, type, days_off from staff where active order by
          case type when 'fijo' then 0 when 'ocasional' then 1 else 2 end, name`,
    sql`select staff_id, to_char(work_date, 'YYYY-MM-DD') as work_date, status,
          to_char(start_time, 'HH24:MI') as start_time
        from shifts where work_date between ${monday} and ${sunday}`,
    sql`select key, value from settings`,
  ])) as [StaffRow[], ShiftRow[], SettingRow[]];

  const staff: Staff[] = staffRows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    daysOff: (r.days_off ?? []).map(Number),
  }));

  const dates = weekDates(monday);
  const sched: Record<number, Cell[]> = {};
  for (const p of staff) sched[p.id] = dates.map(() => ({ s: "off" }));
  for (const r of shiftRows) {
    const i = dates.indexOf(r.work_date);
    if (i < 0 || !sched[r.staff_id]) continue;
    sched[r.staff_id][i] = r.status === "from" ? { s: "from", t: r.start_time ?? "07:00" } : { s: "full" };
  }

  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const settings: Settings = { open: s.open ?? "07:00", cutoff: s.cutoff ?? "06:00" };

  return { staff, sched, settings };
}
