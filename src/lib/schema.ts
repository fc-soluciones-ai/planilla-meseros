import { db } from "./db";

// Esquema de la base. Se aplica en una base nueva o cuando schema_version es de una versión anterior.
// En shifts, un día sin fila toma el valor por defecto: los fijos trabajan todo menos sus días libres.
// Una fila con status 'off' es un libre marcado a mano.
export const SCHEMA_VERSION = "3";

const STATEMENTS = [
  `create table if not exists staff (
    id          serial primary key,
    name        text not null,
    type        text not null check (type in ('fijo', 'ocasional', 'propietario')),
    days_off    smallint[] not null default '{}',   -- 0 = lunes ... 6 = domingo
    active      boolean not null default true,
    created_at  timestamptz not null default now()
  )`,
  `create table if not exists shifts (
    staff_id    int not null references staff(id) on delete cascade,
    work_date   date not null,                      -- fecha del turno (la madrugada va al día anterior)
    status      text not null,
    start_time  time,                               -- hora de entrada si no hizo el día completo
    updated_at  timestamptz not null default now(),
    primary key (staff_id, work_date)
  )`,
  // Restricciones con nombre fijo para poder cambiarlas en bases existentes
  `alter table shifts drop constraint if exists shifts_status_check`,
  `alter table shifts drop constraint if exists shifts_check`,
  `alter table shifts add constraint shifts_status_check check (status in ('full', 'from', 'off'))`,
  `alter table shifts add constraint shifts_check check (status <> 'from' or start_time is not null)`,
  `create table if not exists settings (
    key    text primary key,
    value  text not null
  )`,
  `alter table staff add column if not exists daily_wage int not null default 15000`,
  `alter table staff add column if not exists pos_name text`,
  // Cuentas con propina del archivo de ventas. El folio evita duplicados al volver a subir un archivo.
  `create table if not exists tickets (
    folio           bigint primary key,
    waiter          text not null,
    billed_at       timestamp not null,             -- hora local de facturación, tal como la da el sistema
    amount          numeric(12,2) not null default 0,
    tip_cash        numeric(12,2) not null default 0,
    tip_vouchers    numeric(12,2) not null default 0,
    tip_other       numeric(12,2) not null default 0,
    tip_card        numeric(12,2) not null default 0,
    commission      numeric(12,2) not null default 0,
    commission_tax  numeric(12,2) not null default 0,
    tip_total       numeric(12,2) not null,
    imported_at     timestamptz not null default now()
  )`,
  `create index if not exists tickets_billed_at on tickets (billed_at)`,
  `insert into settings (key, value) values ('open', '07:00'), ('cutoff', '05:00')
   on conflict (key) do nothing`,
];

export async function ensureSchema() {
  const sql = db();
  for (const s of STATEMENTS) await sql.query(s);
  await sql`insert into settings (key, value) values ('schema_version', ${SCHEMA_VERSION})
            on conflict (key) do update set value = excluded.value`;
}

/** Error de Postgres por tabla o columna que no existe: la base es de una versión anterior. */
export const isOldSchema = (e: unknown) => ["42P01", "42703"].includes((e as { code?: string })?.code ?? "");

/** Ejecuta la consulta; si la base está desactualizada, aplica el esquema y reintenta una vez. */
export async function withSchema<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isOldSchema(e)) throw e;
    await ensureSchema();
    return await fn();
  }
}
