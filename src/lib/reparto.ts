// Cálculo de la planilla: salario por día trabajado + reparto de propinas (sin dependencias de servidor).
import { DLONG, isPresent, opMin, turnDate, type Cell, type Staff } from "./turnos";

/** Cuenta con propina ya cargada: fecha y hora de facturación tal como vienen del sistema. */
export type Ticket = { date: string; time: string; tip: number; amount: number };

export type DayCalc = {
  total: number;      // propina del día (día + madrugada siguiente hasta la hora de corte)
  sales: number;      // ventas del día (importe de las cuentas, sin propina)
  tickets: number;
  people: number;     // personas marcadas ese día
  unassigned: number; // propina facturada a una hora en que no había nadie marcado
  first: { time: string; nextDay: boolean } | null; // primera cuenta del turno
  last: { time: string; nextDay: boolean } | null;  // última cuenta (puede ser de la madrugada siguiente)
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
    total: 0, sales: 0, tickets: 0, unassigned: 0, first: null, last: null,
    people: team.filter((p) => sched[p.id]?.[d]?.s !== "off").length,
  }));
  const exact: Record<number, number[]> = {};
  for (const p of team) exact[p.id] = dates.map(() => 0);

  for (const t of tickets) {
    const d = dates.indexOf(turnDate(t.date, t.time, cutoff));
    if (d < 0) continue; // pertenece a otra semana
    days[d].total += t.tip;
    days[d].sales += t.amount;
    days[d].tickets += 1;
    const m = opMin(t.time, cutoff);
    const mark = { time: t.time, nextDay: m >= 1440 };
    if (!days[d].first || m < opMin(days[d].first!.time, cutoff)) days[d].first = mark;
    if (!days[d].last || m > opMin(days[d].last!.time, cutoff)) days[d].last = mark;
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

/**
 * Avisos para revisar antes de pagar. El reparto es por el total del día, sin importar qué nombre
 * aparece en la cuenta; solo se avisa si hubo propina a una hora en que no había nadie marcado.
 */
export function weekWarnings(days: DayCalc[]): Warning[] {
  return days.flatMap((x, d) =>
    x.unassigned > 0
      ? [{ level: "warn" as const, text: `El ${DLONG[d]} hay ₡${Math.round(x.unassigned).toLocaleString("en-US")} de propina facturada cuando no había nadie marcado. No se repartió.` }]
      : [],
  );
}
