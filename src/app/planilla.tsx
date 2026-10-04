"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { calcWeek, weekWarnings, type Ticket } from "@/lib/reparto";
import {
  DAYS, DLONG, TYPES, addDays, fmt, isPresent, opMin, shortDate, toMin, weekDates,
  type Cell, type Settings, type Staff, type StaffType,
} from "@/lib/turnos";
import {
  addStaff, deactivateStaff, importVentas, logout, saveSettings, saveShift, saveStaffWeek, updateStaff,
  type ImportResult, type StaffInput,
} from "./actions";

type Props = {
  monday: string;
  today: string;
  staff: Staff[];
  sched: Record<number, Cell[]>;
  settings: Settings;
  tickets: Ticket[];
};
type Tab = "staff" | "day" | "tips";
type Sheet = { kind: "days"; id: number } | { kind: "form"; id: number | null } | { kind: "slip"; id: number } | null;

const GROUPS: { type: StaffType; title: string }[] = [
  { type: "fijo", title: "Meseros fijos" },
  { type: "ocasional", title: "Apoyo ocasional" },
  { type: "propietario", title: "Propietarios · su propina entra al reparto, no reciben parte" },
];
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const firstName = (n: string) => n.split(/\s+/)[0];
const money = (n: number) => "₡" + Math.round(n).toLocaleString("en-US");

export default function Planilla(props: Props) {
  const { monday, today } = props;
  const dates = weekDates(monday);
  const [staff, setStaff] = useState(props.staff);
  const [sched, setSched] = useState(props.sched);
  const [settings, setSettings] = useState(props.settings);
  const [tab, setTab] = useState<Tab>("staff");
  const [day, setDay] = useState(() => Math.max(0, dates.indexOf(today)));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  // Cambia la pantalla de una vez y guarda en segundo plano.
  function persist(fn: () => Promise<unknown>, ok?: string) {
    startTransition(async () => {
      try {
        await fn();
        if (ok) flash(ok);
      } catch {
        setToast({ msg: "No se guardó. Revise la conexión o vuelva a entrar, y recargue la página.", err: true });
      }
    });
  }
  function flash(msg: string) {
    setToast({ msg });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 2200);
  }

  function setCell(id: number, d: number, cell: Cell) {
    setSched((s) => ({ ...s, [id]: s[id].map((c, i) => (i === d ? cell : c)) }));
    persist(() => saveShift(id, dates[d], cell));
  }
  function setWeek(id: number, cells: Cell[]) {
    setSched((s) => ({ ...s, [id]: cells }));
    persist(() => saveStaffWeek(id, monday, cells));
  }

  const a = dates[0], b = dates[6];
  const thisWeek = dates.includes(today);

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="brand">
            <h1>Planilla de meseros</h1>
            <form action={logout}><button className="link">Salir</button></form>
          </div>
          <div className="weeknav">
            <Link className="iconbtn" href={`/?semana=${addDays(monday, -7)}`} aria-label="Semana anterior">‹</Link>
            <div className="lbl">
              <span>Semana {shortDate(a).split(" ")[0]} – {shortDate(b)} {b.slice(0, 4)}</span>
              {!thisWeek && <Link href="/">Ir a esta semana</Link>}
            </div>
            <Link className="iconbtn" href={`/?semana=${addDays(monday, 7)}`} aria-label="Semana siguiente">›</Link>
          </div>
        </header>

        <main>
          {tab === "staff" && (
            <StaffTab staff={staff} sched={sched}
              onEdit={(id) => setSheet({ kind: "days", id })}
              onAdd={() => setSheet({ kind: "form", id: null })} />
          )}
          {tab === "day" && (
            <DayTab staff={staff} sched={sched} settings={settings} dates={dates} day={day} setDay={setDay} />
          )}
          {tab === "tips" && (
            <TipsTab monday={monday} dates={dates} staff={staff} sched={sched} tickets={props.tickets}
              settings={settings}
              onSlip={(id) => setSheet({ kind: "slip", id })}
              onChange={(s) => {
                setSettings(s);
                persist(() => saveSettings(s.open, s.cutoff), "Horario guardado");
              }} />
          )}
        </main>
      </div>

      <nav className="tabs">
        <TabButton on={tab === "staff"} onClick={() => setTab("staff")} label="Meseros"
          icon={<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M16 14.6c2.6-.3 4.8 1.4 5.5 4.4" /></>} />
        <TabButton on={tab === "day"} onClick={() => setTab("day")} label="Día"
          icon={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>} />
        <TabButton on={tab === "tips"} onClick={() => setTab("tips")} label="Propinas"
          icon={<><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.2 0 3 5.6 1.6 5.6 4.5 0 1.3-1.2 2.2-2.8 2.2-1.3 0-2.4-.6-2.9-1.7M12 6v1.6M12 16.4V18" /></>} />
      </nav>

      {sheet?.kind === "days" && (() => {
        const p = staff.find((x) => x.id === sheet.id);
        if (!p) return null;
        return (
          <DaysSheet person={p} cells={sched[p.id]} dates={dates} settings={settings}
            onCell={(d, c) => setCell(p.id, d, c)}
            onWeek={(cells) => setWeek(p.id, cells)}
            onEditPerson={() => setSheet({ kind: "form", id: p.id })}
            onClose={() => setSheet(null)} />
        );
      })()}

      {sheet?.kind === "form" && (
        <StaffForm
          person={sheet.id ? staff.find((x) => x.id === sheet.id) ?? null : null}
          busy={pending}
          onClose={() => setSheet(null)}
          onSave={(input) => {
            if (sheet.id) {
              const id = sheet.id;
              setStaff((s) => s.map((x) => (x.id === id ? { ...x, ...input } : x)));
              persist(() => updateStaff(id, input), "Datos guardados");
              setSheet({ kind: "days", id });
            } else {
              startTransition(async () => {
                try {
                  const p = await addStaff(input);
                  setStaff((s) => [...s, p]);
                  setSched((s) => ({ ...s, [p.id]: dates.map(() => ({ s: "off" })) }));
                  setSheet({ kind: "days", id: p.id });
                } catch {
                  setToast({ msg: "No se pudo agregar. Revise la conexión.", err: true });
                }
              });
            }
          }}
          onRemove={sheet.id ? () => {
            const id = sheet.id!;
            setStaff((s) => s.filter((x) => x.id !== id));
            persist(() => deactivateStaff(id), "Persona quitada de la lista");
            setSheet(null);
          } : undefined}
        />
      )}

      {sheet?.kind === "slip" && (() => {
        const p = staff.find((x) => x.id === sheet.id);
        if (!p) return null;
        return <SlipSheet person={p} monday={monday} dates={dates} staff={staff} sched={sched}
          tickets={props.tickets} settings={settings} onClose={() => setSheet(null)} />;
      })()}

      {toast && (
        <div className={`toast${toast.err ? " err" : ""}`} role="status">
          {toast.msg}
        </div>
      )}
    </>
  );
}

function TabButton({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button className={on ? "on" : ""} onClick={onClick} aria-current={on ? "page" : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
      {label}
    </button>
  );
}

function Dots({ cells }: { cells: Cell[] }) {
  return (
    <span className="dots">
      {cells.map((c, d) => (
        <span key={d} className={`dot ${c.s}`} title={DLONG[d]}>
          {c.s === "from" ? c.t!.slice(0, 2) : DAYS[d][0]}
        </span>
      ))}
    </span>
  );
}

function StaffTab({ staff, sched, onEdit, onAdd }: {
  staff: Staff[]; sched: Record<number, Cell[]>; onEdit: (id: number) => void; onAdd: () => void;
}) {
  return (
    <>
      <h2>¿Quién trabaja esta semana?</h2>
      <p className="hint">Toque a una persona para marcar sus días. Si no trabajó el día completo, ponga la hora en que entró.</p>
      {staff.length === 0 && (
        <div className="empty">Todavía no hay meseros. Agregue el primero con el botón de abajo.</div>
      )}
      {GROUPS.map(({ type, title }) => {
        const ps = staff.filter((p) => p.type === type);
        if (!ps.length) return null;
        return (
          <section key={type}>
            <h2>{title}</h2>
            <div className="list">
              {ps.map((p) => (
                <button key={p.id} className="row" onClick={() => onEdit(p.id)}>
                  <span className={`avatar ${p.type}`}>{initials(p.name)}</span>
                  <span className="who"><b>{p.name}</b><Dots cells={sched[p.id]} /></span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button className="addbtn" onClick={onAdd}>+ Agregar persona</button>
      <div className="legend">
        <span><i style={{ background: "var(--accent)" }} />Día completo</span>
        <span><i style={{ background: "var(--part)" }} />Entró a la hora indicada</span>
        <span><i style={{ background: "var(--off)" }} />Libre</span>
      </div>
    </>
  );
}

function hourOptions(open: string, current?: string) {
  const out: string[] = [];
  for (let m = toMin(open); m <= toMin("23:30"); m += 30) out.push(fmt(m));
  if (current && !out.includes(current)) out.push(current);
  return out.sort();
}

function DaysSheet({ person: p, cells, dates, settings, onCell, onWeek, onEditPerson, onClose }: {
  person: Staff; cells: Cell[]; dates: string[]; settings: Settings;
  onCell: (d: number, c: Cell) => void; onWeek: (cells: Cell[]) => void;
  onEditPerson: () => void; onClose: () => void;
}) {
  const quick = (q: "normal" | "finde" | "none") =>
    onWeek(DAYS.map((_, d): Cell =>
      q === "none" ? { s: "off" } :
      q === "finde" ? (d >= 4 ? { s: "full" } : { s: "off" }) :
      p.daysOff.includes(d) ? { s: "off" } : { s: "full" }));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`Días de ${p.name}`}>
        <div className="grab" />
        <div className="sheethead">
          <span className={`avatar ${p.type}`}>{initials(p.name)}</span>
          <h3>
            {p.name}
            <div className="tag">
              {TYPES[p.type]}{p.daysOff.length > 0 && ` · libres ${p.daysOff.map((d) => DLONG[d]).join(" y ")}`}
            </div>
          </h3>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="quick">
          {p.type === "fijo" && <button className="chip" onClick={() => quick("normal")}>Semana normal</button>}
          <button className="chip" onClick={() => quick("finde")}>Solo vie–dom</button>
          <button className="chip" onClick={() => quick("none")}>Toda la semana libre</button>
        </div>
        {cells.map((c, d) => (
          <div className="dayrow" key={d}>
            <div className="dname">{DAYS[d]}<small>{shortDate(dates[d])}</small></div>
            <div className="seg" role="group" aria-label={DLONG[d]}>
              <button className={c.s === "off" ? "on off" : ""} onClick={() => onCell(d, { s: "off" })}>Libre</button>
              <button className={c.s === "full" ? "on full" : ""} onClick={() => onCell(d, { s: "full" })}>Completo</button>
              <button className={c.s === "from" ? "on from" : ""} onClick={() => onCell(d, { s: "from", t: c.t ?? "15:00" })}>Desde…</button>
            </div>
            {c.s === "from" && (
              <label className="timepick">
                Entró a las
                <select id={`t-${p.id}-${d}`} value={c.t} onChange={(e) => onCell(d, { s: "from", t: e.target.value })}>
                  {hourOptions(settings.open, c.t).map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            )}
          </div>
        ))}
        <button className="primary" onClick={onClose}>Listo</button>
        <button className="secondary" onClick={onEditPerson}>Editar nombre, tipo o días libres</button>
      </div>
    </>
  );
}

function StaffForm({ person, busy, onSave, onRemove, onClose }: {
  person: Staff | null; busy: boolean;
  onSave: (input: StaffInput) => void;
  onRemove?: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [wage, setWage] = useState(String(person?.dailyWage ?? 15000));
  const [posName, setPosName] = useState(person?.posName ?? "");
  const [type, setType] = useState<StaffType>(person?.type ?? "ocasional");
  const [daysOff, setDaysOff] = useState<number[]>(person?.daysOff ?? []);
  const [confirm, setConfirm] = useState(false);
  const toggle = (d: number) => setDaysOff((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="sheet" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
          name: name.trim(), type, daysOff: type === "fijo" ? daysOff : [],
          dailyWage: Math.max(0, Math.round(Number(wage) || 0)), posName: posName.trim() || null,
        });
      }}>
        <div className="grab" />
        <div className="sheethead">
          <h3>{person ? "Editar persona" : "Agregar persona"}</h3>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <label className="field">
          Nombre
          <input id="staff-name" value={name} maxLength={60} required placeholder="Ej. José Pérez" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Tipo
          <select id="staff-type" value={type} onChange={(e) => setType(e.target.value as StaffType)}>
            {GROUPS.map((g) => <option key={g.type} value={g.type}>{TYPES[g.type]}</option>)}
          </select>
        </label>
        <label className="field">
          Salario por día trabajado (₡)
          <input id="staff-wage" inputMode="numeric" value={wage} onChange={(e) => setWage(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="field">
          Nombre en el sistema del restaurante
          <input id="staff-pos" value={posName} maxLength={60} placeholder={name ? firstName(name).toUpperCase() : "Ej. SHAI"} onChange={(e) => setPosName(e.target.value)} />
          <small className="hint">Solo si en el reporte de ventas aparece distinto a su primer nombre.</small>
        </label>
        {type === "fijo" && (
          <fieldset className="field">
            <legend>Días libres de siempre</legend>
            <div className="quick">
              {DAYS.map((n, d) => (
                <button type="button" key={d} className={`chip${daysOff.includes(d) ? " on" : ""}`} onClick={() => toggle(d)} aria-pressed={daysOff.includes(d)}>{n}</button>
              ))}
            </div>
          </fieldset>
        )}
        <button className="primary" type="submit" disabled={busy}>{person ? "Guardar" : "Agregar"}</button>
        {onRemove && (confirm
          ? <button type="button" className="secondary danger" onClick={onRemove}>Sí, quitar a {firstName(person!.name)}</button>
          : <button type="button" className="secondary danger" onClick={() => setConfirm(true)}>Quitar de la lista</button>)}
      </form>
    </>
  );
}

function DayPicker({ dates, day, setDay }: { dates: string[]; day: number; setDay: (d: number) => void }) {
  return (
    <div className="daypick">
      {DAYS.map((n, d) => (
        <button key={d} className={d === day ? "sel" : ""} onClick={() => setDay(d)}>
          {n}<small>{dates[d].slice(8).replace(/^0/, "")}</small>
        </button>
      ))}
    </div>
  );
}

function DayTab({ staff, sched, settings, dates, day, setDay }: {
  staff: Staff[]; sched: Record<number, Cell[]>; settings: Settings; dates: string[]; day: number; setDay: (d: number) => void;
}) {
  const start = toMin(settings.open);
  const end = toMin(settings.cutoff) + 1440;
  const pct = (m: number) => `${(((m - start) / (end - start)) * 100).toFixed(2)}%`;
  const working = staff.filter((p) => sched[p.id][day].s !== "off");
  const next = addDays(dates[day], 1);
  const ticks = [start, toMin("11:00"), toMin("15:00"), toMin("19:00"), 1440, end].filter((m) => m >= start && m <= end);
  const countAt = (t: string) => staff.filter((p) => isPresent(sched[p.id][day], t, settings.cutoff)).length;

  return (
    <>
      <h2>Turno del {DLONG[day]} {shortDate(dates[day])}</h2>
      <DayPicker dates={dates} day={day} setDay={setDay} />
      <div className="turnbox">
        El turno abre el <b>{DLONG[day]} {settings.open}</b> y cierra el{" "}
        <b>{DLONG[(day + 1) % 7]} {shortDate(next)} {fmt(toMin(settings.cutoff) - 1)}</b>.
        Todo lo facturado en ese rango, incluida la madrugada, suma a este día.
      </div>
      <h2>Quién estuvo y desde qué hora</h2>
      <div className="tl">
        <div className="tlgrid">
          {working.length === 0 && <p className="hint">Nadie marcado para este día. Márquelo en la pestaña Meseros.</p>}
          {working.map((p) => {
            const c = sched[p.id][day];
            const from = c.s === "full" ? start : opMin(c.t!, settings.cutoff);
            return (
              <div className="tlrow" key={p.id}>
                <span className="nm">{firstName(p.name)}</span>
                <div className="track">
                  <div className={`bar ${c.s}`} style={{ left: pct(from) }} />
                  <div className="midnight" style={{ left: pct(1440) }} />
                </div>
              </div>
            );
          })}
          <div className="axis">
            <span />
            <div>{ticks.map((m) => <span key={m} style={{ left: pct(m) }}>{m === 1440 ? "00:00" : fmt(m)}</span>)}</div>
          </div>
        </div>
      </div>
      <div className="count">
        {([["11:00", "Mediodía"], ["15:00", "Tarde"], ["20:00", "Noche"], ["01:00", "Madrugada"]] as const).map(([t, l]) => (
          <span key={t} className={`pill${t === "01:00" ? " p" : ""}`}>{l} {t}: {countAt(t)} personas</span>
        ))}
      </div>
    </>
  );
}

function TipsTab({ monday, dates, staff, sched, tickets, settings, onSlip, onChange }: {
  monday: string; dates: string[]; staff: Staff[]; sched: Record<number, Cell[]>; tickets: Ticket[];
  settings: Settings; onSlip: (id: number) => void; onChange: (s: Settings) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  const { days, people } = calcWeek(dates, staff, sched, tickets, settings.cutoff);
  const warnings = weekWarnings(dates, staff, sched, tickets, settings.cutoff, days);
  const totalTips = days.reduce((a, d) => a + d.total, 0);
  const paid = people.filter((p) => p.total > 0);
  const sum = (k: "salary" | "tip" | "total") => paid.reduce((a, p) => a + p[k], 0);
  const rounding = Math.round(totalTips - days.reduce((a, d) => a + d.unassigned, 0)) - sum("tip");

  function upload(file: File) {
    const form = new FormData();
    form.append("archivo", file);
    startUpload(async () => {
      try {
        const r = await importVentas(form);
        setResult(r);
        if (r.ok) router.refresh();
      } catch {
        setResult({ ok: false, error: "No se pudo subir. Revise la conexión o vuelva a entrar." });
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <>
      <h2>Archivo de ventas</h2>
      <div className="rule">
        <p>Exporte <b>Cuentas con propina</b> del sistema de <b>lunes a lunes</b> y súbalo aquí tal como sale. La madrugada del lunes siguiente se suma al domingo. Si lo sube dos veces no se duplica.</p>
        <input ref={fileRef} id="ventas-file" type="file" accept=".xls,.xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button className="primary" style={{ marginTop: 4 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Cargando…" : "Subir archivo de ventas"}
        </button>
        {result?.ok === false && <p className="error">{result.error}</p>}
        {result?.ok && (
          <p className="okmsg">
            Listo: {result.total} cuentas del {result.from.slice(8, 10)}/{result.from.slice(5, 7)} al {result.to.slice(8, 10)}/{result.to.slice(5, 7)}
            {" "}({result.added} nuevas{result.updated ? `, ${result.updated} ya estaban` : ""}), {money(result.tips)} de propina.
          </p>
        )}
      </div>

      <h2>Propina por día</h2>
      {tickets.length === 0 ? (
        <div className="empty">Todavía no hay cuentas cargadas para esta semana. Suba el archivo de ventas.</div>
      ) : (
        <div className="tbl"><table>
          <thead><tr><th>Día</th><th className="n">Propina</th><th className="n">Meseros</th><th className="n">c/u</th></tr></thead>
          <tbody>
            {days.map((d, i) => {
              const partial = staff.some((p) => p.type !== "propietario" && sched[p.id][i].s === "from");
              return (
                <tr key={i}>
                  <td>{DAYS[i]} {dates[i].slice(8).replace(/^0/, "")}</td>
                  <td className="n">{money(d.total)}</td>
                  <td className="n">{d.people}</td>
                  <td className="n">{d.people ? (partial ? "por hora" : money(d.total / d.people)) : "—"}</td>
                </tr>
              );
            })}
            <tr className="tot"><td>Semana</td><td className="n">{money(totalTips)}</td><td /><td /></tr>
          </tbody>
        </table></div>
      )}

      {warnings.length > 0 && (
        <>
          <h2>Para revisar</h2>
          <div className="warns">
            {warnings.map((w, i) => <p key={i} className={`warnrow ${w.level}`}>{w.text}</p>)}
          </div>
        </>
      )}

      <h2>Planilla de la semana</h2>
      {paid.length === 0 ? (
        <div className="empty">Marque quién trabajó en la pestaña Meseros para ver la planilla.</div>
      ) : (
        <>
          <p className="hint">Toque a una persona para ver su boleta.</p>
          <div className="tbl"><table>
            <thead><tr><th>Persona</th><th className="n">Salario</th><th className="n">Propina</th><th className="n">Total</th></tr></thead>
            <tbody>
              {paid.map((r) => {
                const p = staff.find((x) => x.id === r.id)!;
                return (
                  <tr key={r.id} className="tap" onClick={() => onSlip(r.id)}>
                    <td>{p.name}</td><td className="n">{money(r.salary)}</td><td className="n">{money(r.tip)}</td><td className="n"><b>{money(r.total)}</b></td>
                  </tr>
                );
              })}
              <tr className="tot"><td>Total</td><td className="n">{money(sum("salary"))}</td><td className="n">{money(sum("tip"))}</td><td className="n">{money(sum("total"))}</td></tr>
            </tbody>
          </table></div>
          {rounding !== 0 && <p className="note">Diferencia por redondear al colón: {money(rounding)}.</p>}
        </>
      )}

      <h2>Reglas</h2>
      <div className="rule">
        <p><b>Propina del día:</b> todo el día más la madrugada siguiente hasta la hora de corte, dividido entre los meseros que trabajaron.</p>
        <p><b>Quien entró tarde</b> recibe solo de las cuentas facturadas desde su hora de entrada.</p>
        <p><b>Semana:</b> lunes a domingo (el archivo de lunes a lunes).</p>
        <div className="cfg">
          <label className="field">
            Abre a las
            <select id="cfg-open" value={settings.open} onChange={(e) => onChange({ ...settings, open: e.target.value })}>
              {["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            Hora de corte
            <select id="cfg-cutoff" value={settings.cutoff} onChange={(e) => onChange({ ...settings, cutoff: e.target.value })}>
              {["03:00", "04:00", "05:00", "06:00"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <p className="note" style={{ margin: 0 }}>Semana del {shortDate(monday)} · el cálculo se actualiza al marcar o cambiar horas.</p>
      </div>
    </>
  );
}

function SlipSheet({ person: p, monday, dates, staff, sched, tickets, settings, onClose }: {
  person: Staff; monday: string; dates: string[]; staff: Staff[]; sched: Record<number, Cell[]>;
  tickets: Ticket[]; settings: Settings; onClose: () => void;
}) {
  const r = calcWeek(dates, staff, sched, tickets, settings.cutoff).people.find((x) => x.id === p.id)!;
  const [copied, setCopied] = useState(false);
  const worked = r.days.map((d, i) => ({ ...d, i })).filter((d) => sched[p.id][d.i].s !== "off" || d.tip > 0);
  const text = [
    `*Planilla ${p.name}*`,
    `Semana ${shortDate(dates[0])} al ${shortDate(dates[6])}`,
    "",
    ...worked.map((d) => `${DAYS[d.i]} ${dates[d.i].slice(8)}: salario ${money(d.salary)} + propina ${money(d.tip)}`),
    "",
    `Salario: ${money(r.salary)}`,
    `Propinas: ${money(r.tip)}`,
    `*Total a pagar: ${money(r.total)}*`,
  ].join("\n");

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sin portapapeles */ }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`Boleta de ${p.name}`}>
        <div className="grab" />
        <div className="sheethead">
          <span className={`avatar ${p.type}`}>{initials(p.name)}</span>
          <h3>{p.name}<div className="tag">Semana {shortDate(monday)} – {shortDate(dates[6])}</div></h3>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="tbl"><table>
          <thead><tr><th>Día</th><th className="n">Salario</th><th className="n">Propina</th></tr></thead>
          <tbody>
            {worked.map((d) => {
              const c = sched[p.id][d.i];
              return (
                <tr key={d.i}>
                  <td>{DAYS[d.i]} {dates[d.i].slice(8).replace(/^0/, "")}{c.s === "from" && <small className="hint"> desde {c.t}</small>}</td>
                  <td className="n">{money(d.salary)}</td><td className="n">{money(d.tip)}</td>
                </tr>
              );
            })}
            <tr className="tot"><td>Subtotal</td><td className="n">{money(r.salary)}</td><td className="n">{money(r.tip)}</td></tr>
          </tbody>
        </table></div>
        <div className="grand"><span>Total a pagar</span><b>{money(r.total)}</b></div>
        <a className="primary linkbtn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
        <button className="secondary" onClick={copy}>{copied ? "Copiado" : "Copiar texto"}</button>
      </div>
    </>
  );
}
