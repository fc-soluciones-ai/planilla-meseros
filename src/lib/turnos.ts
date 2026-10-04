// Reglas del turno operativo y utilidades de fechas (sin dependencias de servidor).

export type Status = "off" | "full" | "from";
export type Cell = { s: Status; t?: string };
export type StaffType = "fijo" | "ocasional" | "propietario";
export type Staff = {
  id: number;
  name: string;
  type: StaffType;
  daysOff: number[];
  dailyWage: number;
};
export type Settings = {
  open: string;
  cutoff: string;
  /** Nombre del restaurante para las boletas (se toma del archivo de ventas). */
  restaurant: string;
};

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DLONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const TYPES: Record<StaffType, string> = {
  fijo: "Mesero fijo",
  ocasional: "Apoyo ocasional",
  propietario: "Propietario (no recibe propina)",
};

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Fechas como texto "AAAA-MM-DD", calculadas en UTC para que no se corran por zona horaria.
const parse = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Lunes de la semana a la que pertenece la fecha. */
export function mondayOf(date: string): string {
  const dow = (parse(date).getUTCDay() + 6) % 7; // 0 = lunes
  return addDays(date, -dow);
}

export function weekDates(monday: string): string[] {
  return DAYS.map((_, i) => addDays(monday, i));
}

export function shortDate(date: string): string {
  const d = parse(date);
  return `${d.getUTCDate()} ${MES[d.getUTCMonth()]}`;
}

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const fmt = (m: number) => {
  m = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};

/**
 * Minutos dentro del turno operativo. Lo que ocurre antes de la hora de corte
 * es madrugada del turno anterior, así que se cuenta después de las 24:00.
 */
export function opMin(time: string, cutoff: string): number {
  const m = toMin(time);
  return m < toMin(cutoff) ? m + 1440 : m;
}

/** Fecha del turno al que pertenece una factura (madrugada → día anterior). */
export function turnDate(date: string, time: string, cutoff: string): string {
  return toMin(time) < toMin(cutoff) ? addDays(date, -1) : date;
}

/** ¿La persona estaba trabajando a esa hora del turno? La propina corre desde su hora de entrada. */
export function isPresent(cell: Cell, time: string, cutoff: string): boolean {
  if (cell.s === "full") return true;
  if (cell.s === "from" && cell.t) return opMin(cell.t, cutoff) <= opMin(time, cutoff);
  return false;
}

/** Fecha de hoy en la zona horaria del restaurante. */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Día por defecto: los fijos trabajan todo menos sus días libres; ocasionales y propietarios, libres. */
export function defaultCell(p: Pick<Staff, "type" | "daysOff">, day: number): Cell {
  return p.type === "fijo" && !p.daysOff.includes(day) ? { s: "full" } : { s: "off" };
}
