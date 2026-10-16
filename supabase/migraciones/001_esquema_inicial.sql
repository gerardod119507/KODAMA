-- =====================================================================
-- KODAMA · Migración 001: las tablas
-- =====================================================================
-- Ya aplicada en el proyecto "kodama" de Supabase (16 oct 2026). Queda
-- aquí como registro: si alguna vez hay que recrear la base desde cero,
-- se corren las migraciones de esta carpeta en orden, en SQL Editor.
--
-- Las mismas 8 hojas del Sheet como tablas, con las mismas columnas
-- (sin tildes en los nombres: "título" pasa a "titulo", "área" a "area").
--
-- Seguridad: cada fila lleva "owner" (tu usuario). Con Row Level Security,
-- solo quien inició sesión como dueño puede leer o escribir sus filas.
-- La clave pública (anon key) que va en la página no abre nada por sí sola.
--
-- Este archivo no tiene datos personales: puede ir al repo público.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
create table public.areas (
  nombre   text primary key,
  color    text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  posicion integer not null default 0,
  owner    uuid not null default auth.uid() references auth.users (id) on delete cascade
);

create table public.cursos (
  nombre text primary key,
  corto  text,
  owner  uuid not null default auth.uid() references auth.users (id) on delete cascade
);

create table public.colegios (
  nombre text primary key,
  corto  text,
  owner  uuid not null default auth.uid() references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Alumnos (Academia Fractal)
-- curso y colegio apuntan a su catálogo: si renombras un curso, el cambio
-- llega solo a todos los alumnos (on update cascade).
-- Los campos de tutor, materias y fecha_inicio son nuevos: quedan vacíos
-- hasta el paso de la ficha de alumno completa.
-- ---------------------------------------------------------------------
create table public.alumnos (
  id               text primary key check (id ~ '^a[0-9a-f]{8}$'),
  nombre           text not null,
  apellido         text,
  curso            text references public.cursos (nombre) on update cascade on delete set null,
  colegio          text references public.colegios (nombre) on update cascade on delete set null,
  tarifa_hora      numeric(10, 2) check (tarifa_hora >= 0),
  forma_calculo    text,
  forma_pago       text,
  notas            text,
  lugar            text,
  archivado        boolean not null default false,
  -- nuevos
  materias         text,
  tutor_nombre     text,
  tutor_parentesco text,
  tutor_telefono   text,
  fecha_inicio     date,
  owner            uuid not null default auth.uid() references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Horario: reglas que se repiten ("estos días, entre estas fechas").
-- ---------------------------------------------------------------------
create table public.horario (
  id         text primary key check (id ~ '^h[0-9a-f]{8}$'),
  titulo     text,
  area       text not null references public.areas (nombre) on update cascade,
  dias       text not null,
  inicio     text not null check (inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  fin        text not null check (fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  desde      date not null,
  hasta      date not null,
  etiqueta   text,
  notas      text,
  archivado  boolean not null default false,
  alumno_ids text[] not null default '{}',
  lugar      text,
  creado     timestamptz not null default now(),
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check (fin > inicio),
  check (hasta >= desde)
);

-- ---------------------------------------------------------------------
-- Bloques: cada clase, reunión o bloque de trabajo con su fecha.
-- serie_id se calcula solo: un bloque generado por una regla tiene id
-- "h1234abcd-2026-09-22" y su serie es "h1234abcd". Sin FK a horario a
-- propósito: borrar una regla deja las clases pasadas (las dictadas
-- cuentan para el cobro).
-- ---------------------------------------------------------------------
create table public.bloques (
  id              text primary key,
  titulo          text,
  area            text not null references public.areas (nombre) on update cascade,
  tipo            text not null check (tipo in ('fijo', 'variable', 'reunión')),
  fecha           date not null,
  inicio          text not null check (inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  fin             text not null check (fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  etiqueta        text,
  notas           text,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  archivado       boolean not null default false,
  alumno_ids      text[] not null default '{}',
  lugar           text,
  estado          text not null default 'programada'
                  check (estado in ('programada', 'dictada', 'movida', 'cancelada')),
  fecha_original  date,
  inicio_original text check (inicio_original ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  fin_original    text check (fin_original ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  motivo          text,
  serie_id        text generated always as (
                    case when id ~ '^h[0-9a-f]{8}-' then substr(id, 1, 9) end
                  ) stored,
  owner           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check (fin > inicio)
);

create index bloques_fecha_inicio on public.bloques (fecha, inicio);
create index bloques_serie on public.bloques (serie_id) where serie_id is not null;
create index bloques_alumnos on public.bloques using gin (alumno_ids);

-- ---------------------------------------------------------------------
-- Pagos y plantillas (hoy vacías en el Sheet)
-- ---------------------------------------------------------------------
create table public.pagos (
  id         text primary key,
  alumno_id  text not null references public.alumnos (id),
  desde      date not null,
  hasta      date not null,
  monto      numeric(10, 2) not null check (monto >= 0),
  fecha_pago date,
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'pagado')),
  notas      text,
  creado     timestamptz not null default now(),
  archivado  boolean not null default false,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check (hasta >= desde)
);

create table public.plantillas (
  id         text primary key,
  nombre     text not null,
  area       text not null references public.areas (nombre) on update cascade,
  tipo       text not null check (tipo in ('fijo', 'variable', 'reunión')),
  titulo     text,
  alumno_ids text[] not null default '{}',
  duracion   integer check (duracion > 0), -- minutos
  lugar      text,
  etiqueta   text,
  creado     timestamptz not null default now(),
  archivado  boolean not null default false,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------
-- "actualizado" se pone solo en cada cambio de un bloque
-- ---------------------------------------------------------------------
create function public.tocar_actualizado() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

create trigger bloques_actualizado
  before update on public.bloques
  for each row execute function public.tocar_actualizado();

-- ---------------------------------------------------------------------
-- Row Level Security: solo el dueño ve y toca sus filas
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['areas', 'cursos', 'colegios', 'alumnos', 'horario', 'bloques', 'pagos', 'plantillas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy solo_dueno on public.%I for all to authenticated '
      'using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

commit;
