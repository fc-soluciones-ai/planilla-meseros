// Cálculo de la planilla: salario por día trabajado + reparto de propinas (sin dependencias de servidor).
import { DLONG, isPresent, opMin, turnDate, type Cell, type Staff } from "./turnos";

/** Cuenta con propina ya cargada: fecha y hora de facturación tal como vienen del sistema. */
export type Ticket = { date: string; time: string; tip: number; waiter: string };

export type DayCalc = {
  total: number;      // propina del día (día + madrugada siguiente hasta la hora de corte)
  tickets: number;
  people: number;     // personas marcadas ese día
  unassigned: number; // propina facturada a una hora en que no había nadie marcado
};
export type PersonCalc = {
  id: number;
  days: { salary: number; tip: number }[];
  salary: number;
  tip: number;
  total: number;
};
export type Warning = { level: "warn" | "info"; text: string };

/** Los propietarios facturan y su propina entra al reparto, pero no reciben parte ni salario. */
export const sharesTips = (p: Staff) => p.type !== "propietario";

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

/** Nombre con que la persona aparece en el sistema: el configurado o su primer nombre. */
export const posKey = (p: Staff) => norm(p.posName || p.name.split(/\s+/)[0]);

/**
 * Método de la dueña: la propina de cada día se divide entre quienes trabajaron ese día.
 * Quien entró tarde solo participa de las cuentas facturadas desde su hora de entrada,
 * así que cada cuenta se reparte entre las personas presentes a la hora en que se facturó.
 * Si todos hicieron el día completo, da lo mismo que total del día ÷ cantidad de meseros.
 */
export function calcWeek(
  dates: string[], staff: Staff[], sched: Record<number, Cell[]>, tickets: Ticket[], cutoff: string,
) {
  const team = staff.filter(sharesTips);
  const days: DayCalc[] = dates.map((_, d) => ({
    total: 0, tickets: 0, unassigned: 0,
    people: team.filter((p) => sched[p.id]?.[d]?.s !== "off").length,
  }));
  const exact: Record<number, number[]> = {};
  for (const p of team) exact[p.id] = dates.map(() => 0);

  for (const t of tickets) {
    const d = dates.indexOf(turnDate(t.date, t.time, cutoff));
    if (d < 0) continue; // pertenece a otra semana
    days[d].total += t.tip;
    days[d].tickets += 1;
    const present = team.filter((p) => sched[p.id] && isPresent(sched[p.id][d], t.time, cutoff));
    if (!present.length) { days[d].unassigned += t.tip; continue; }
    for (const p of present) exact[p.id][d] += t.tip / present.length;
  }

  // Se redondea al colón por persona y por día; la boleta suma esos montos.
  const people: PersonCalc[] = team.map((p) => {
    const ds = dates.map((_, d) => ({
      salary: sched[p.id]?.[d]?.s !== "off" ? p.dailyWage : 0,
      tip: Math.round(exact[p.id][d]),
    }));
    const salary = ds.reduce((a, x) => a + x.salary, 0);
    const tip = ds.reduce((a, x) => a + x.tip, 0);
    return { id: p.id, days: ds, salary, tip, total: salary + tip };
  });

  return { days, people };
}

/** Avisos para revisar antes de pagar: lo que no encaja entre el archivo y lo marcado. */
export function weekWarnings(
  dates: string[], staff: Staff[], sched: Record<number, Cell[]>, tickets: Ticket[], cutoff: string, days: DayCalc[],
): Warning[] {
  const out: Warning[] = [];
  const byKey = new Map(staff.map((p) => [posKey(p), p]));
  const unknown = new Map<string, number>();
  const seen = new Set<string>();

  for (const t of tickets) {
    const d = dates.indexOf(turnDate(t.date, t.time, cutoff));
    if (d < 0) continue;
    const p = byKey.get(norm(t.waiter));
    if (!p) { unknown.set(t.waiter, (unknown.get(t.waiter) ?? 0) + t.tip); continue; }
    if (!sharesTips(p)) continue;
    const cell = sched[p.id][d];
    const key = `${p.id}-${d}`;
    if (seen.has(key)) continue;
    if (cell.s === "off") {
      seen.add(key);
      out.push({ level: "warn", text: `${p.name} facturó el ${DLONG[d]} a las ${t.time} pero está libre ese día.` });
    } else if (cell.s === "from" && opMin(t.time, cutoff) < opMin(cell.t!, cutoff)) {
      seen.add(key);
      out.push({ level: "warn", text: `${p.name} facturó el ${DLONG[d]} a las ${t.time} pero está marcado desde las ${cell.t}.` });
    }
  }
  days.forEach((x, d) => {
    if (x.unassigned > 0) {
      out.push({ level: "warn", text: `El ${DLONG[d]} hay ₡${Math.round(x.unassigned).toLocaleString("en-US")} de propina facturada cuando no había nadie marcado. No se repartió.` });
    }
  });
  for (const [w, tip] of unknown) {
    out.push({ level: "info", text: `${w} facturó ₡${Math.round(tip).toLocaleString("en-US")} de propina y no está en la planilla. Su propina sí entra al reparto del día. Si es del equipo o propietario, escriba "${w}" como nombre en el sistema de esa persona.` });
  }
  return out;
}
