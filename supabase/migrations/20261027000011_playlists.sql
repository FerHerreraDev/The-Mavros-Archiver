-- =============================================================================
-- LISTAS PERSONALES (PL-01, PL-02 de tests/SPEC.md)
-- =============================================================================
-- Privadas: cada quien solo ve y toca las suyas (tampoco un admin ve las ajenas).
-- Web y Android las escriben directo con la sesión del usuario: RLS es la regla.
-- =============================================================================

create table if not exists public.playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint playlists_name_length check (char_length(name) between 1 and 100 and name = btrim(name))
);

create index if not exists playlists_user_idx on public.playlists (user_id, created_at);

drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at
  before update on public.playlists
  for each row execute function public.set_updated_at();

alter table public.playlists enable row level security;

drop policy if exists "playlists_select_own" on public.playlists;
drop policy if exists "playlists_insert_own" on public.playlists;
drop policy if exists "playlists_update_own" on public.playlists;
drop policy if exists "playlists_delete_own" on public.playlists;

create policy "playlists_select_own" on public.playlists for select to authenticated using (user_id = auth.uid());
create policy "playlists_insert_own" on public.playlists for insert to authenticated with check (user_id = auth.uid());
create policy "playlists_update_own" on public.playlists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "playlists_delete_own" on public.playlists for delete to authenticated using (user_id = auth.uid());

-- Elementos -------------------------------------------------------------------
create table if not exists public.playlist_items (
  id           uuid primary key default gen_random_uuid(),
  playlist_id  uuid not null references public.playlists (id) on delete cascade,
  movie_id     uuid references public.movies (id) on delete cascade,
  series_id    uuid references public.series (id) on delete cascade,
  position     integer not null,
  added_at     timestamptz not null default now(),

  -- Una película/episodio o una serie, nunca ambos ni ninguno
  constraint playlist_items_one_target check ((movie_id is null) <> (series_id is null))
);

create unique index if not exists playlist_items_movie_unique on public.playlist_items (playlist_id, movie_id) where movie_id is not null;
create unique index if not exists playlist_items_series_unique on public.playlist_items (playlist_id, series_id) where series_id is not null;
create index if not exists playlist_items_order_idx on public.playlist_items (playlist_id, position);

-- Lo nuevo va al final si no se manda posición
create or replace function public.playlist_items_default_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1 into new.position from public.playlist_items where playlist_id = new.playlist_id;
  end if;
  return new;
end;
$$;

drop trigger if exists playlist_items_default_position on public.playlist_items;
create trigger playlist_items_default_position
  before insert on public.playlist_items
  for each row execute function public.playlist_items_default_position();

alter table public.playlist_items enable row level security;

-- ¿La lista es mía? (la subconsulta corre con el RLS de quien llama: solo existen sus listas)
create or replace function public.owns_playlist(target uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.playlists p where p.id = target and p.user_id = auth.uid())
$$;

-- Solo lo publicado (también para un admin: una lista es para ver, no para borradores).
-- Las subconsultas corren con el RLS del usuario: un episodio de una serie en borrador no existe para él.
create or replace function public.playlist_target_visible(movie uuid, show uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (movie is null or exists (select 1 from public.movies m where m.id = movie and m.status = 'published'))
     and (show is null or exists (select 1 from public.series s where s.id = show and s.status = 'published'))
$$;

drop policy if exists "playlist_items_select_own" on public.playlist_items;
drop policy if exists "playlist_items_insert_own" on public.playlist_items;
drop policy if exists "playlist_items_update_own" on public.playlist_items;
drop policy if exists "playlist_items_delete_own" on public.playlist_items;

create policy "playlist_items_select_own" on public.playlist_items for select to authenticated
  using (public.owns_playlist(playlist_id));
create policy "playlist_items_insert_own" on public.playlist_items for insert to authenticated
  with check (public.owns_playlist(playlist_id) and public.playlist_target_visible(movie_id, series_id));
create policy "playlist_items_update_own" on public.playlist_items for update to authenticated
  using (public.owns_playlist(playlist_id))
  with check (public.owns_playlist(playlist_id) and public.playlist_target_visible(movie_id, series_id));
create policy "playlist_items_delete_own" on public.playlist_items for delete to authenticated
  using (public.owns_playlist(playlist_id));
