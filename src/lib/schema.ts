import { db } from "./db";

// Esquema de la base. Se aplica solo la primera vez que la app no encuentra las tablas.
// Un día libre NO tiene fila en shifts: solo se guardan los días trabajados.
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
    status      text not null check (status in ('full', 'from')),
    start_time  time,                               -- hora de entrada si no hizo el día completo
    updated_at  timestamptz not null default now(),
    primary key (staff_id, work_date),
    check (status = 'full' or start_time is not null)
  )`,
  `create table if not exists settings (
    key    text primary key,
    value  text not null
  )`,
  `insert into settings (key, value) values ('open', '07:00'), ('cutoff', '05:00')
   on conflict (key) do nothing`,
];

export async function ensureSchema() {
  const sql = db();
  for (const s of STATEMENTS) await sql.query(s);
}

/** Error de Postgres "la tabla no existe". */
export const isMissingTable = (e: unknown) => (e as { code?: string })?.code === "42P01";
