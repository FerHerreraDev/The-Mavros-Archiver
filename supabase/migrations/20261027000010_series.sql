-- =============================================================================
-- SERIES (SER-01..SER-04 de tests/SPEC.md)
-- =============================================================================
-- Un episodio es una fila de movies con series_id + temporada + número: reutiliza el
-- token de video, el progreso y los reproductores sin cambios.
--
-- - series: mismas reglas que movies (user lee publicadas, admin todo, anon nada)
-- - episodios: un user los ve solo si el episodio Y su serie están publicados.
--   watch_progress y /api/playback ya consultan movies con el RLS de quien llama,
--   así que heredan la regla sin tocarlos.
-- =============================================================================

create table if not exists public.series (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  original_title    text,
  synopsis          text,
  release_year      integer,
  genres            text[] not null default '{}',
  poster_url        text,
  poster_image_url  text,
  poster_thumbhash  text,
  status            text not null default 'draft',
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz,

  constraint series_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  constraint series_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint series_synopsis_length check (synopsis is null or char_length(synopsis) <= 2000),
  constraint series_year_range check (release_year is null or release_year between 1888 and 2100),
  constraint series_poster_https check (poster_url is null or poster_url ~ '^https://'),
  constraint series_poster_image_https check (poster_image_url is null or poster_image_url ~ '^https?://'),
  constraint series_poster_thumbhash_format check (
    poster_thumbhash is null
    or (poster_thumbhash ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(poster_thumbhash) between 8 and 64)
  ),
  constraint series_status check (status in ('draft', 'published'))
);

create index if not exists series_published_idx on public.series (published_at desc) where status = 'published';

-- Las mismas funciones de movies sirven para series (solo tocan columnas que ambas tienen)
drop trigger if exists series_published_at on public.series;
create trigger series_published_at
  before insert or update on public.series
  for each row execute function public.movies_set_published_at();

drop trigger if exists series_guard_created_by on public.series;
create trigger series_guard_created_by
  before insert or update on public.series
  for each row execute function public.movies_guard_created_by();

drop trigger if exists series_set_updated_at on public.series;
create trigger series_set_updated_at
  before update on public.series
  for each row execute function public.set_updated_at();

alter table public.series enable row level security;

drop policy if exists "series_select_published" on public.series;
drop policy if exists "series_select_admin"     on public.series;
drop policy if exists "series_insert_admin"     on public.series;
drop policy if exists "series_update_admin"     on public.series;
drop policy if exists "series_delete_admin"     on public.series;

create policy "series_select_published"
  on public.series for select
  to authenticated
  using (status = 'published');

create policy "series_select_admin"
  on public.series for select
  to authenticated
  using (public.is_admin());

create policy "series_insert_admin"
  on public.series for insert
  to authenticated
  with check (public.is_admin());

create policy "series_update_admin"
  on public.series for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "series_delete_admin"
  on public.series for delete
  to authenticated
  using (public.is_admin());

-- Episodios ------------------------------------------------------------------
alter table public.movies add column if not exists series_id uuid references public.series (id) on delete cascade;
alter table public.movies add column if not exists season_number integer;
alter table public.movies add column if not exists episode_number integer;

alter table public.movies drop constraint if exists movies_episode_fields;
alter table public.movies add constraint movies_episode_fields check (
  (series_id is null and season_number is null and episode_number is null)
  or (
    series_id is not null
    and season_number is not null
    and episode_number is not null
    and season_number between 0 and 999
    and episode_number between 1 and 9999
  )
);

create unique index if not exists movies_episode_unique
  on public.movies (series_id, season_number, episode_number)
  where series_id is not null;

-- Un user ve el episodio solo si su serie también está publicada. La subconsulta corre con
-- el RLS del user: para él solo existen las series publicadas.
drop policy if exists "movies_select_published" on public.movies;
create policy "movies_select_published"
  on public.movies for select
  to authenticated
  using (
    status = 'published'
    and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.status = 'published'))
  );
