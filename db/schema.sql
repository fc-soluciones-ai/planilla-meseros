-- Planilla de meseros: esquema de base de datos (Postgres / Neon en Vercel)
-- Un día libre NO tiene fila en shifts. Solo se guardan los días trabajados.

create table if not exists staff (
  id          serial primary key,
  name        text not null,
  type        text not null check (type in ('fijo', 'ocasional', 'propietario')),
  -- días libres habituales: 0 = lunes ... 6 = domingo
  days_off    smallint[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists shifts (
  staff_id    int not null references staff(id) on delete cascade,
  -- fecha del turno operativo (la madrugada pertenece al día anterior)
  work_date   date not null,
  status      text not null check (status in ('full', 'from')),
  -- hora de entrada cuando no trabajó el día completo
  start_time  time,
  updated_at  timestamptz not null default now(),
  primary key (staff_id, work_date),
  check (status = 'full' or start_time is not null)
);

create table if not exists settings (
  key    text primary key,
  value  text not null
);

insert into settings (key, value) values
  ('open', '07:00'),
  ('cutoff', '06:00')
on conflict (key) do nothing;
