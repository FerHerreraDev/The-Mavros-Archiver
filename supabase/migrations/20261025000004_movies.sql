-- =============================================================================
-- MOVIES (MOV-01..MOV-06 de tests/SPEC.md)
-- =============================================================================
-- Las reglas viven aquí (RLS), no solo en Server Actions: así la web y la futura
-- app Android (supabase-kt con la clave pública) comparten exactamente lo mismo.
--
-- - authenticated: lee solo publicadas
-- - admin (is_admin()): lee todo y escribe
-- - anon: nada
-- =============================================================================

create table if not exists public.movies (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  original_title    text,
  synopsis          text,
  release_year      integer,
  duration_seconds  integer not null,
  genres            text[] not null default '{}',
  poster_url        text,
  -- Ruta dentro del bucket (ej. movies/chainsaw-man-reze-arc/master.m3u8).
  -- La URL base la pone cada cliente: cambiar de dominio no obliga a migrar datos.
  hls_path          text not null,
  status            text not null default 'draft',
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz,

  constraint movies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  constraint movies_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint movies_synopsis_length check (synopsis is null or char_length(synopsis) <= 2000),
  constraint movies_year_range check (release_year is null or release_year between 1888 and 2100),
  constraint movies_duration_positive check (duration_seconds > 0),
  constraint movies_hls_path_format check (
    hls_path ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\.m3u8$'
    and hls_path !~ '(^|/)\.\.(/|$)'
  ),
  constraint movies_poster_https check (poster_url is null or poster_url ~ '^https://'),
  constraint movies_status check (status in ('draft', 'published'))
);

create index if not exists movies_published_idx on public.movies (published_at desc) where status = 'published';

-- RLS ------------------------------------------------------------------------
alter table public.movies enable row level security;

drop policy if exists "movies_select_published" on public.movies;
drop policy if exists "movies_select_admin"     on public.movies;
drop policy if exists "movies_insert_admin"     on public.movies;
drop policy if exists "movies_update_admin"     on public.movies;
drop policy if exists "movies_delete_admin"     on public.movies;

create policy "movies_select_published"
  on public.movies for select
  to authenticated
  using (status = 'published');

create policy "movies_select_admin"
  on public.movies for select
  to authenticated
  using (public.is_admin());

create policy "movies_insert_admin"
  on public.movies for insert
  to authenticated
  with check (public.is_admin());

create policy "movies_update_admin"
  on public.movies for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "movies_delete_admin"
  on public.movies for delete
  to authenticated
  using (public.is_admin());

-- Triggers -------------------------------------------------------------------
-- published_at: se fija al publicar, se borra al volver a borrador
create or replace function public.movies_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at = now();
  elsif new.status = 'draft' then
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists movies_published_at on public.movies;
create trigger movies_published_at
  before insert or update on public.movies
  for each row execute function public.movies_set_published_at();

-- created_by: al crear es siempre quien hace el insert (si hay sesión); después no cambia
create or replace function public.movies_guard_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by = auth.uid();
    end if;
    new.created_at = now();
  else
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists movies_keep_created_by on public.movies;
drop trigger if exists movies_guard_created_by on public.movies;
create trigger movies_guard_created_by
  before insert or update on public.movies
  for each row execute function public.movies_guard_created_by();

drop trigger if exists movies_set_updated_at on public.movies;
create trigger movies_set_updated_at
  before update on public.movies
  for each row execute function public.set_updated_at();
