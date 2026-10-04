"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import InstallButton from "./install-button";
import { calcWeek, weekWarnings, type PersonCalc, type Ticket } from "@/lib/reparto";
import { shareFiles, slipImage, type SlipData } from "@/lib/boleta";
import {
  DAYS, DLONG, TYPES, addDays, fmt, shortDate, toMin, weekDates,
  type Cell, type Settings, type Staff, type StaffType,
} from "@/lib/turnos";
import {
  addStaff, addUser, changeUserPassword, deactivateStaff, deleteUser, importVentas, logout, saveRestaurant, saveSettings, saveShift, updateStaff,
  type ImportResult, type StaffInput, type UserResult,
} from "./actions";
import type { AppUser } from "@/lib/data";
import type { Session } from "@/lib/auth";

type Props = {
  monday: string;
  today: string;
  staff: Staff[];
  sched: Record<number, Cell[]>;
  settings: Settings;
  tickets: Ticket[];
  users: AppUser[];
  me: Session;
};
type Tab = "staff" | "tips" | "config";
type Sheet = { kind: "form"; id: number | null } | { kind: "slip"; id: number } | null;

const GROUPS: { type: StaffType; title: string }[] = [
  { type: "fijo", title: "Meseros fijos" },
  { type: "ocasional", title: "Apoyo ocasional" },
  { type: "propietario", title: "Propietarios · su propina entra al reparto, no reciben parte" },
];
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const firstName = (n: string) => n.split(/\s+/)[0];
const money = (n: number) => "₡" + Math.round(n).toLocaleString("en-US");

/** Datos de la boleta de una persona para la semana. */
function slipData(p: Staff, r: PersonCalc, dates: string[], sched: Record<number, Cell[]>, restaurant: string): SlipData {
  return {
    restaurant: restaurant || "Planilla de meseros",
    name: p.name,
    week: `Semana del ${shortDate(dates[0])} al ${shortDate(dates[6])} ${dates[6].slice(0, 4)}`,
    rows: r.days
      .map((d, i) => ({ ...d, i, c: sched[p.id][i] }))
      .filter((d) => d.c.s !== "off" || d.tip > 0)
      .map((d) => ({
        day: `${DAYS[d.i]} ${dates[d.i].slice(8).replace(/^0/, "")}`,
        note: d.c.s === "from" ? `desde ${d.c.t}` : undefined,
        salary: d.salary,
        tip: d.tip,
      })),
    salary: r.salary,
    tip: r.tip,
    total: r.total,
  };
}

export default function Planilla(props: Props) {
  const { monday, today } = props;
  const dates = weekDates(monday);
  const [staff, setStaff] = useState(props.staff);
  const [sched, setSched] = useState(props.sched);
  const [settings, setSettings] = useState(props.settings);
  const [tab, setTab] = useState<Tab>("staff");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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


  const a = dates[0], b = dates[6];
  const thisWeek = dates.includes(today);

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="brand">
            <span className="brandmark">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectorial, no necesita optimización */}
              <img src="/logo.svg" alt="D'charly's" width={52} height={44} />
              <h1>Planilla de meseros</h1>
            </span>
          </div>
          {tab !== "config" && (
            <div className="weeknav">
              <Link className="iconbtn" href={`/?semana=${addDays(monday, -7)}`} aria-label="Semana anterior">‹</Link>
              <div className="lbl">
                <span>Semana {shortDate(a).split(" ")[0]} – {shortDate(b)} {b.slice(0, 4)}</span>
                {!thisWeek && <Link href="/">Ir a esta semana</Link>}
              </div>
              <Link className="iconbtn" href={`/?semana=${addDays(monday, 7)}`} aria-label="Semana siguiente">›</Link>
            </div>
          )}
          <InstallButton />
        </header>

        <main>
          {tab === "staff" && (
            <StaffTab staff={staff} sched={sched} dates={dates} today={today} settings={settings}
              onCell={setCell}
              onGoConfig={() => setTab("config")} />
          )}
          {tab === "tips" && (
            <TipsTab restaurant={settings.restaurant || props.settings.restaurant} dates={dates} staff={staff} sched={sched} tickets={props.tickets}
              settings={settings}
              onSlip={(id) => setSheet({ kind: "slip", id })}
 />
          )}
          {tab === "config" && (
            <ConfigTab users={props.users} me={props.me} staff={staff}
              onEdit={(id) => setSheet({ kind: "form", id })}
              onAdd={() => setSheet({ kind: "form", id: null })}
              settings={{ ...settings, restaurant: settings.restaurant || props.settings.restaurant }}
              onRestaurant={(name) => {
                setSettings((s) => ({ ...s, restaurant: name.trim() }));
                persist(() => saveRestaurant(name), "Nombre guardado");
              }}
              onSettings={(s) => {
                setSettings(s);
                persist(() => saveSettings(s.open, s.cutoff), "Horario guardado");
              }} />
          )}
        </main>
      </div>

      <nav className="tabs">
        <TabButton on={tab === "staff"} onClick={() => setTab("staff")} label="Meseros"
          icon={<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M16 14.6c2.6-.3 4.8 1.4 5.5 4.4" /></>} />
        <TabButton on={tab === "tips"} onClick={() => setTab("tips")} label="Propinas"
          icon={<><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.2 0 3 5.6 1.6 5.6 4.5 0 1.3-1.2 2.2-2.8 2.2-1.3 0-2.4-.6-2.9-1.7M12 6v1.6M12 16.4V18" /></>} />
        <TabButton on={tab === "config"} onClick={() => setTab("config")} label="Configuración"
          icon={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} />
      </nav>

      {sheet?.kind === "form" && (
        <StaffForm
          person={sheet.id ? staff.find((x) => x.id === sheet.id) ?? null : null}
          busy={pending}
          onClose={() => setSheet(null)}
          onSave={(input) => {
            if (sheet.id) {
              const id = sheet.id;
              setStaff((s) => s.map((x) => (x.id === id ? { ...x, ...input } : x)));
              // recarga la semana para que los días por defecto sigan los días libres nuevos
              persist(async () => { await updateStaff(id, input); router.refresh(); }, "Datos guardados");
              setSheet(null);
            } else {
              startTransition(async () => {
                try {
                  await addStaff(input);
                  setSheet(null);
                  router.refresh(); // trae a la persona con sus días por defecto
                } catch {
                  setToast({ msg: "No se pudo agregar. Revise la conexión.", err: true });
                }
              });
            }
          }}
          onRemove={sheet.id ? () => {
            const id = sheet.id!;
            setStaff((s) => s.filter((x) => x.id !== id));
            persist(async () => { await deactivateStaff(id); router.refresh(); }, "Persona quitada de la lista");
            setSheet(null);
          } : undefined}
        />
      )}

      {sheet?.kind === "slip" && (
        <SlipSheet id={sheet.id} dates={dates} staff={staff} sched={sched}
          tickets={props.tickets} settings={settings} restaurant={settings.restaurant || props.settings.restaurant}
          onNav={(id) => setSheet({ kind: "slip", id })}
          onClose={() => setSheet(null)} />
      )}

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

type Mode = "day" | "hour";

/**
 * Cuadrícula de la semana. Los fijos ya vienen marcados con sus días de siempre: solo se cambia lo distinto.
 * Fijos: el toque alterna Libre ↔ Completo (o abre la hora, en modo "Hora de entrada").
 * Ocasionales: el toque siempre abre el selector de hora del celular.
 */
function StaffTab({ staff, sched, dates, today, settings, onCell, onGoConfig }: {
  staff: Staff[]; sched: Record<number, Cell[]>; dates: string[]; today: string; settings: Settings;
  onCell: (id: number, d: number, c: Cell) => void; onGoConfig: () => void;
}) {
  const [mode, setMode] = useState<Mode>("day");
  const fixed = staff.filter((p) => p.type === "fijo");
  const casual = staff.filter((p) => p.type === "ocasional");
  const team = [...fixed, ...casual];
  const hours = hourOptions(settings.open);

  const cellFor = (p: Staff, d: number, asPicker: boolean) => {
    const c = sched[p.id][d];
    const label = `${p.name}, ${DLONG[d]}: ${c.s === "off" ? "libre" : c.s === "full" ? "completo" : "desde " + c.t}`;
    const face = c.s === "from" ? c.t!.slice(0, 2) + (c.t!.endsWith(":00") ? "" : "½") : c.s === "full" ? "✓" : asPicker ? "+" : "";
    if (!asPicker) {
      return (
        <button key={d} className={`gcell ${c.s}`} aria-label={label}
          onClick={() => onCell(p.id, d, c.s === "off" ? { s: "full" } : { s: "off" })}>
          {face}
        </button>
      );
    }
    return (
      <label key={d} className={`gcell ${c.s}${c.s === "off" ? " add" : ""}`} aria-label={label}>
        {face}
        <select id={`g-${p.id}-${d}`} value={c.s === "from" ? c.t : c.s}
          onChange={(e) => {
            const v = e.target.value;
            onCell(p.id, d, v === "off" || v === "full" ? { s: v } : { s: "from", t: v });
          }}>
          <option value="off">Libre</option>
          <option value="full">Completo</option>
          {(c.s === "from" && !hours.includes(c.t!) ? [...hours, c.t!].sort() : hours).map((h) => (
            <option key={h} value={h}>Desde {h}</option>
          ))}
        </select>
      </label>
    );
  };

  const row = (p: Staff, asPicker: boolean) => (
    <div className="grow" role="row" key={p.id}>
      <span className="gname"><span className="gn">{firstName(p.name)}</span></span>
      {sched[p.id].map((_, d) => cellFor(p, d, asPicker))}
    </div>
  );

  return (
    <>
      <h2>¿Quién trabaja esta semana?</h2>
      {team.length === 0 ? (
        <div className="empty">
          Todavía no hay meseros. <button className="link inline-link" onClick={onGoConfig}>Agréguelos en Configuración</button>.
        </div>
      ) : (
        <>
          <p className="hint">Los fijos ya vienen con sus días de siempre. Cambie solo lo que fue distinto. Se guarda solo.</p>
          {fixed.length > 0 && (
            <div className="modebar" role="group" aria-label="Qué hace el toque en los fijos">
              <span>Fijos, al tocar:</span>
              <div className="seg two">
                <button className={mode === "day" ? "on full" : ""} onClick={() => setMode("day")}>Marcar / desmarcar</button>
                <button className={mode === "hour" ? "on from" : ""} onClick={() => setMode("hour")}>Poner hora</button>
              </div>
            </div>
          )}

          <div className="grid" role="table" aria-label="Días trabajados">
            <div className="grow head" role="row">
              <span className="gname" />
              {DAYS.map((n, d) => (
                <span key={d} className={`ghead${dates[d] === today ? " today" : ""}`} role="columnheader">
                  {n.slice(0, 1)}<small>{dates[d].slice(8).replace(/^0/, "")}</small>
                </span>
              ))}
            </div>
            {fixed.map((p) => row(p, mode === "hour"))}
            {casual.length > 0 && (
              <>
                <div className="gsep" role="row"><span>Ocasionales · toque el día y escoja la hora en que entró</span></div>
                {casual.map((p) => row(p, true))}
              </>
            )}
            <div className="grow foot" role="row">
              <span className="gname">Meseros</span>
              {DAYS.map((_, d) => (
                <span key={d} className="gcount">{team.filter((p) => sched[p.id][d].s !== "off").length}</span>
              ))}
            </div>
          </div>

          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />Completo</span>
            <span><i style={{ background: "var(--part)" }} />Desde la hora (15 = 3 p. m.)</span>
            <span><i style={{ background: "var(--off)" }} />Libre</span>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Para agregar meseros o cambiar sus días libres, vaya a{" "}
            <button className="link inline-link" onClick={onGoConfig}>Configuración</button>.
          </p>        </>
      )}

    </>
  );
}

function hourOptions(open: string, current?: string) {
  const out: string[] = [];
  for (let m = toMin(open); m <= toMin("23:30"); m += 30) out.push(fmt(m));
  if (current && !out.includes(current)) out.push(current);
  return out.sort();
}

function StaffForm({ person, busy, onSave, onRemove, onClose }: {
  person: Staff | null; busy: boolean;
  onSave: (input: StaffInput) => void;
  onRemove?: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [wage, setWage] = useState(String(person?.dailyWage ?? 15000));
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
          dailyWage: Math.max(0, Math.round(Number(wage) || 0)),
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

function TipsTab({ restaurant, dates, staff, sched, tickets, settings, onSlip }: {
  restaurant: string; dates: string[]; staff: Staff[]; sched: Record<number, Cell[]>; tickets: Ticket[];
  settings: Settings; onSlip: (id: number) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  const { days, people } = calcWeek(dates, staff, sched, tickets, settings.cutoff);
  const warnings = weekWarnings(days);
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
          <button className="primary" onClick={() => onSlip(paid[0].id)}>Ver boletas una por una</button>
          <button className="secondary" disabled={sharing} onClick={async () => {
            setSharing(true); setShareMsg(null);
            try {
              const files = await Promise.all(paid.map((r) => slipImage(slipData(staff.find((x) => x.id === r.id)!, r, dates, sched, restaurant))));
              const res = await shareFiles(files, `Boletas semana ${shortDate(dates[0])}`);
              if (res === "downloaded") setShareMsg("Este navegador no permite compartir: las boletas se descargaron como imágenes.");
            } catch {
              setShareMsg("No se pudieron generar las boletas.");
            }
            setSharing(false);
          }}>{sharing ? "Preparando…" : `Compartir todas las boletas (${paid.length})`}</button>
          {shareMsg && <p className="note">{shareMsg}</p>}
        </>
      )}

    </>
  );
}

/**
 * Vista previa de las boletas tal como se envían. Con las flechas se pasa de una persona a otra
 * y cada una se comparte por separado.
 */
function SlipSheet({ id, dates, staff, sched, tickets, settings, restaurant, onNav, onClose }: {
  id: number; dates: string[]; staff: Staff[]; sched: Record<number, Cell[]>;
  tickets: Ticket[]; settings: Settings; restaurant: string;
  onNav: (id: number) => void; onClose: () => void;
}) {
  const paid = calcWeek(dates, staff, sched, tickets, settings.cutoff).people.filter((x) => x.total > 0);
  const idx = Math.max(0, paid.findIndex((x) => x.id === id));
  const r = paid[idx];
  const p = staff.find((x) => x.id === r?.id);
  const [preview, setPreview] = useState<{ id: number; file: File; url: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const data = p && r ? slipData(p, r, dates, sched, restaurant) : null;
  const key = data ? JSON.stringify(data) : "";

  // Genera la imagen de la boleta que se está viendo
  useEffect(() => {
    if (!data || !p) return;
    let alive = true;
    let url = "";
    slipImage(data).then((file) => {
      if (!alive) return;
      url = URL.createObjectURL(file);
      setPreview({ id: p.id, file, url });
    }).catch(() => alive && setNote("No se pudo generar la boleta."));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se regenera cuando cambian los datos de la boleta
  }, [key]);

  if (!p || !r || !data) return null;
  const ready = preview?.id === p.id ? preview : null;
  const go = (d: number) => { setNote(null); onNav(paid[(idx + d + paid.length) % paid.length].id); };

  const text = [
    `*Planilla ${p.name}*`,
    data.week,
    "",
    ...data.rows.map((d) => `${d.day}: salario ${money(d.salary)} + propina ${money(d.tip)}`),
    "",
    `Salario: ${money(r.salary)}`,
    `Propinas: ${money(r.tip)}`,
    `*Total a pagar: ${money(r.total)}*`,
  ].join("\n");

  async function share() {
    if (!ready) return;
    setSharing(true); setNote(null);
    // la imagen ya está lista: el menú Compartir se abre de inmediato
    const res = await shareFiles([ready.file], `Boleta ${p!.name}`);
    if (res === "downloaded") setNote("Este navegador no permite compartir: la boleta se descargó como imagen.");
    setSharing(false);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`Boleta de ${p.name}`}>
        <div className="grab" />
        <div className="sheethead">
          <button className="iconbtn" onClick={() => go(-1)} aria-label="Boleta anterior" disabled={paid.length < 2}>‹</button>
          <h3 className="slipnav">{p.name}<div className="tag">Boleta {idx + 1} de {paid.length}</div></h3>
          <button className="iconbtn" onClick={() => go(1)} aria-label="Boleta siguiente" disabled={paid.length < 2}>›</button>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="slipview">
          {ready
            // eslint-disable-next-line @next/next/no-img-element -- imagen generada en el celular
            ? <img src={ready.url} alt={`Boleta de ${p.name}: total ${money(r.total)}`} />
            : <div className="slipwait">Preparando boleta…</div>}
        </div>
        <button className="primary" disabled={!ready || sharing} onClick={share}>Compartir esta boleta</button>
        <p className="note">Se abre el menú Compartir del celular: escoja WhatsApp y el contacto.</p>
        {note && <p className="note">{note}</p>}
        <a className="secondary linkbtn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Enviar como texto por WhatsApp</a>
      </div>
    </>
  );
}

function ConfigTab({ users, me, staff, settings, onEdit, onAdd, onSettings, onRestaurant }: {
  users: AppUser[]; me: Session; staff: Staff[]; settings: Settings;
  onEdit: (id: number) => void; onAdd: () => void;
  onSettings: (s: Settings) => void; onRestaurant: (name: string) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [newPw, setNewPw] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);

  function run(fn: () => Promise<UserResult>, ok: string, after?: () => void) {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) { setMsg({ text: ok }); after?.(); router.refresh(); }
        else setMsg({ text: r.error, err: true });
      } catch {
        setMsg({ text: "No se pudo guardar. Revise la conexión.", err: true });
      }
    });
  }

  return (
    <>
      <h2>Meseros</h2>
      <p className="hint">Toque a una persona para cambiar su nombre, tipo, días libres o salario.</p>
      <div className="list">
        {staff.length === 0 && <div className="empty">Todavía no hay meseros.</div>}
        {GROUPS.map(({ type }) => staff.filter((p) => p.type === type).map((p) => (
          <button key={p.id} className="row" onClick={() => onEdit(p.id)}>
            <span className={`avatar ${p.type}`}>{initials(p.name)}</span>
            <span className="who">
              <b>{p.name}</b>
              <span className="tag">
                {TYPES[p.type]}
                {p.type === "fijo" && (p.daysOff.length ? ` · libres ${p.daysOff.map((d) => DAYS[d]).join(", ")}` : " · sin días libres")}
                {p.type !== "propietario" && ` · ${money(p.dailyWage)}/día`}
              </span>
            </span>
            <span className="chev">›</span>
          </button>
        )))}
      </div>
      <button className="addbtn" onClick={onAdd}>+ Agregar mesero</button>

      <h2>Usuarios</h2>
      <p className="hint">Personas que pueden entrar a la app con su propio usuario y contraseña.</p>
      <div className="list">
        {users.length === 0 && <div className="empty">Todavía no hay usuarios. Agregue el primero abajo.</div>}
        {users.map((u) => (
          <div key={u.id} className="userrow">
            <div className="who">
              <b>{u.name}{u.id === me.userId && <span className="tag"> · usted</span>}</b>
              <span className="tag">Usuario: {u.username}</span>
            </div>
            {editing === u.id ? (
              <form className="inline" onSubmit={(e) => {
                e.preventDefault();
                run(() => changeUserPassword(u.id, newPw), `Contraseña de ${u.name} cambiada`, () => { setEditing(null); setNewPw(""); });
              }}>
                <input id={`pw-${u.id}`} type="password" autoComplete="new-password" placeholder="Contraseña nueva" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <button className="chip on" disabled={busy}>Guardar</button>
                <button type="button" className="link" onClick={() => setEditing(null)}>Cancelar</button>
              </form>
            ) : removing === u.id ? (
              <div className="inline">
                <button className="chip danger" disabled={busy} onClick={() => run(() => deleteUser(u.id), `${u.name} ya no puede entrar`, () => setRemoving(null))}>Sí, quitar</button>
                <button className="link" onClick={() => setRemoving(null)}>Cancelar</button>
              </div>
            ) : (
              <div className="inline">
                <button className="chip" onClick={() => { setEditing(u.id); setNewPw(""); }}>Cambiar contraseña</button>
                {u.id !== me.userId && <button className="chip" onClick={() => setRemoving(u.id)}>Quitar</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="rule" style={{ marginTop: 12 }} onSubmit={(e) => {
        e.preventDefault();
        run(() => addUser(name, username, password), `Usuario ${username.trim().toLowerCase()} creado`, () => { setName(""); setUsername(""); setPassword(""); });
      }}>
        <b>Agregar usuario</b>
        <label className="field">Nombre<input id="u-name" value={name} maxLength={60} placeholder="Ej. Scarlett" onChange={(e) => setName(e.target.value)} required /></label>
        <label className="field">Usuario para entrar
          <input id="u-username" value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Ej. scarlett"
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} required />
        </label>
        <label className="field">Contraseña
          <span className="pwrow">
            <input id="u-password" type={showPw ? "text" : "password"} autoComplete="new-password" value={password} placeholder="Mínimo 6 caracteres" onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="link" onClick={() => setShowPw((x) => !x)}>{showPw ? "Ocultar" : "Ver"}</button>
          </span>
        </label>
        <button className="primary" disabled={busy}>{busy ? "Guardando…" : "Agregar usuario"}</button>
      </form>
      {msg && <p className={msg.err ? "error" : "okmsg"} style={{ marginTop: 8 }}>{msg.text}</p>}

      <h2>Boletas</h2>
      <form className="inline" onSubmit={(e) => {
        e.preventDefault();
        const v = (e.currentTarget.elements.namedItem("restaurant") as HTMLInputElement).value;
        onRestaurant(v);
      }}>
        <input id="cfg-restaurant" name="restaurant" defaultValue={settings.restaurant} placeholder="Nombre del restaurante" maxLength={80} />
        <button className="chip on">Guardar</button>
      </form>
      <p className="note">Sale arriba en cada boleta. Se toma del archivo de ventas la primera vez.</p>

      <h2>Horario del turno</h2>
      <div className="rule">
        <p>La propina de cada día incluye la madrugada siguiente hasta la hora de corte.</p>
        <div className="cfg">
          <label className="field">
            Abre a las
            <select id="cfg-open" value={settings.open} onChange={(e) => onSettings({ ...settings, open: e.target.value })}>
              {["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            Hora de corte
            <select id="cfg-cutoff" value={settings.cutoff} onChange={(e) => onSettings({ ...settings, cutoff: e.target.value })}>
              {["03:00", "04:00", "05:00", "06:00"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>

      <h2>Sesión</h2>
      <div className="rule">
        <p>Entró como <b>{me.name}</b> ({me.username}).</p>
        <form action={logout}><button className="secondary" style={{ marginTop: 0 }}>Salir</button></form>
      </div>
    </>
  );
}
