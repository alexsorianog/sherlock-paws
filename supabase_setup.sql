-- =====================================================================
--  Sherlock Paws · Base de datos en Supabase
--  Pensado para CONVIVIR con otra app en el mismo proyecto:
--   • todo lleva el prefijo sp_ (tablas, funciones, reglas) y el bucket es "sp-fotos"
--   • solo los usuarios en la lista sp_voluntarios pueden ver o editar datos,
--     aunque el proyecto tenga otros usuarios de otra app
--  Copia TODO en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin romper nada.
-- =====================================================================

-- ---------- Reportes ----------
create table if not exists public.sp_reportes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users(id) on delete set null,
  especie           text not null default 'perro',
  tipo              text not null,
  estado            text not null default 'activo',
  tamano            text not null,
  lat               double precision not null,
  lng               double precision not null,
  radio_km          numeric(5,2) not null default 2,
  fecha_evento      date not null default current_date,
  zona              text,
  nombre_perro      text,
  raza              text,
  color             text,
  sexo              text not null default 'desconocido',
  senas             text,
  foto_path         text,
  huella            text,
  fuente_url        text,
  contacto_nombre   text,
  contacto_telefono text,
  contacto_notas    text
);

alter table public.sp_reportes drop constraint if exists sp_reportes_valores_check;
alter table public.sp_reportes add constraint sp_reportes_valores_check check (
  especie in ('perro','gato') and
  tipo    in ('perdido','visto','resguardo') and
  estado  in ('pendiente','activo','reunido','cerrado') and
  tamano  in ('mini','chico','mediano','grande') and
  sexo    in ('macho','hembra','desconocido') and
  lat between -90 and 90 and lng between -180 and 180 and
  radio_km > 0 and radio_km <= 50 and
  coalesce(char_length(zona),0)              <= 200  and
  coalesce(char_length(nombre_perro),0)      <= 80   and
  coalesce(char_length(raza),0)              <= 80   and
  coalesce(char_length(color),0)             <= 120  and
  coalesce(char_length(senas),0)             <= 1000 and
  coalesce(char_length(foto_path),0)         <= 300  and
  coalesce(char_length(huella),0)            <= 4000 and
  coalesce(char_length(fuente_url),0)        <= 500  and
  coalesce(char_length(contacto_nombre),0)   <= 80   and
  coalesce(char_length(contacto_telefono),0) <= 20   and
  coalesce(char_length(contacto_notas),0)    <= 200
);

create index if not exists sp_reportes_estado_idx on public.sp_reportes (estado);
create index if not exists sp_reportes_fecha_idx  on public.sp_reportes (fecha_evento desc);

create or replace function public.sp_tocar_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists sp_reportes_updated on public.sp_reportes;
create trigger sp_reportes_updated before update on public.sp_reportes
  for each row execute function public.sp_tocar_updated_at();

-- ---------- Coincidencias descartadas ----------
create table if not exists public.sp_descartes (
  perdido_id uuid not null references public.sp_reportes(id) on delete cascade,
  visto_id   uuid not null references public.sp_reportes(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (perdido_id, visto_id)
);

-- ---------- Quién tiene acceso ----------
create table if not exists public.sp_voluntarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.sp_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.sp_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sp_admins where user_id = auth.uid());
$$;
create or replace function public.sp_es_voluntario() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sp_voluntarios where user_id = auth.uid())
      or exists (select 1 from public.sp_admins      where user_id = auth.uid());
$$;

-- ---------- Registro de alertas de Telegram ----------
create table if not exists public.sp_alertas_enviadas (
  reporte_id uuid not null references public.sp_reportes(id) on delete cascade,
  evento     text not null,
  created_at timestamptz not null default now(),
  primary key (reporte_id, evento)
);

-- ---------- Seguridad ----------
alter table public.sp_reportes         enable row level security;
alter table public.sp_descartes        enable row level security;
alter table public.sp_voluntarios      enable row level security;
alter table public.sp_admins           enable row level security;
alter table public.sp_alertas_enviadas enable row level security;  -- sin reglas: solo la función de alertas

drop policy if exists "sp_reportes_leer"    on public.sp_reportes;
drop policy if exists "sp_reportes_crear"   on public.sp_reportes;
drop policy if exists "sp_reportes_editar"  on public.sp_reportes;
drop policy if exists "sp_reportes_borrar"  on public.sp_reportes;
drop policy if exists "sp_reportes_publico" on public.sp_reportes;

create policy "sp_reportes_leer"   on public.sp_reportes for select to authenticated using (public.sp_es_voluntario());
create policy "sp_reportes_crear"  on public.sp_reportes for insert to authenticated
  with check (public.sp_es_voluntario() and created_by = auth.uid());
create policy "sp_reportes_editar" on public.sp_reportes for update to authenticated
  using (public.sp_es_voluntario()) with check (public.sp_es_voluntario());
create policy "sp_reportes_borrar" on public.sp_reportes for delete to authenticated
  using (public.sp_es_voluntario() and (created_by = auth.uid() or estado = 'pendiente' or public.sp_es_admin()));
-- Público sin sesión: solo puede ENVIAR reportes que quedan pendientes. No puede leer nada.
create policy "sp_reportes_publico" on public.sp_reportes for insert to anon
  with check (estado = 'pendiente' and created_by is null and huella is null and radio_km <= 10);

drop policy if exists "sp_descartes_leer"   on public.sp_descartes;
drop policy if exists "sp_descartes_crear"  on public.sp_descartes;
drop policy if exists "sp_descartes_borrar" on public.sp_descartes;
create policy "sp_descartes_leer"   on public.sp_descartes for select to authenticated using (public.sp_es_voluntario());
create policy "sp_descartes_crear"  on public.sp_descartes for insert to authenticated
  with check (public.sp_es_voluntario() and created_by = auth.uid());
create policy "sp_descartes_borrar" on public.sp_descartes for delete to authenticated using (public.sp_es_admin());

drop policy if exists "sp_admins_leer" on public.sp_admins;
create policy "sp_admins_leer" on public.sp_admins for select to authenticated using (public.sp_es_voluntario());
drop policy if exists "sp_voluntarios_leer" on public.sp_voluntarios;
create policy "sp_voluntarios_leer" on public.sp_voluntarios for select to authenticated using (public.sp_es_voluntario());

-- ---------- Fotos (bucket propio "sp-fotos") ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sp-fotos', 'sp-fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "sp_fotos_subir"         on storage.objects;
drop policy if exists "sp_fotos_subir_publico" on storage.objects;
drop policy if exists "sp_fotos_borrar"        on storage.objects;
create policy "sp_fotos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'sp-fotos' and public.sp_es_voluntario() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sp_fotos_subir_publico" on storage.objects for insert to anon
  with check (bucket_id = 'sp-fotos' and (storage.foldername(name))[1] = 'publico');
create policy "sp_fotos_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'sp-fotos' and public.sp_es_voluntario() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (storage.foldername(name))[1] = 'publico'
    or public.sp_es_admin()));

-- =====================================================================
--  DESPUÉS de crear los usuarios (paso 4 de la guía), ejecuta SOLO esto,
--  cambiando los correos:
--
--  -- 1) Tú como administrador:
--  insert into public.sp_admins (user_id)
--  select id from auth.users where email = 'tu-correo@ejemplo.com'
--  on conflict do nothing;
--
--  -- 2) Los voluntarios (agrega o quita correos de la lista):
--  insert into public.sp_voluntarios (user_id)
--  select id from auth.users where email in (
--    'voluntario1@correo.com',
--    'voluntario2@correo.com'
--  ) on conflict do nothing;
--
--  -- Quitarle el acceso a alguien (sin borrar su cuenta de la otra app):
--  delete from public.sp_voluntarios
--  where user_id = (select id from auth.users where email = 'correo@ejemplo.com');
-- =====================================================================
