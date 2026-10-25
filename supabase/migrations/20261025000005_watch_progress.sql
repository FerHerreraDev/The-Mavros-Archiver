-- =============================================================================
-- WATCH PROGRESS (PRG-01..PRG-05 de tests/SPEC.md)
-- =============================================================================
-- Lo escribe el cliente directamente con su sesión (web hoy, Android después):
-- RLS garantiza que cada quien solo toca lo suyo y solo de películas que puede ver.
-- =============================================================================

create table if not exists public.watch_progress (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movie_id          uuid not null references public.movies (id) on delete cascade,
  position_seconds  numeric(10, 3) not null,
  updated_at        timestamptz not null default now(),
  primary key (user_id, movie_id),
  constraint watch_progress_position_positive check (position_seconds >= 0)
);

create index if not exists watch_progress_recent_idx on public.watch_progress (user_id, updated_at desc);

-- La posición no puede pasar la duración de la película (1 s de tolerancia)
-- y updated_at lo pone el servidor, no el cliente
create or replace function public.watch_progress_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  movie_duration integer;
begin
  select duration_seconds into movie_duration from public.movies where id = new.movie_id;
  if movie_duration is not null and new.position_seconds > movie_duration + 1 then
    raise exception 'position_seconds (%) supera la duración de la película (%)', new.position_seconds, movie_duration
      using errcode = 'check_violation';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists watch_progress_guard on public.watch_progress;
create trigger watch_progress_guard
  before insert or update on public.watch_progress
  for each row execute function public.watch_progress_guard();

-- RLS ------------------------------------------------------------------------
alter table public.watch_progress enable row level security;

drop policy if exists "watch_progress_select_own" on public.watch_progress;
drop policy if exists "watch_progress_insert_own" on public.watch_progress;
drop policy if exists "watch_progress_update_own" on public.watch_progress;
drop policy if exists "watch_progress_delete_own" on public.watch_progress;

create policy "watch_progress_select_own"
  on public.watch_progress for select
  to authenticated
  using (user_id = auth.uid());

-- La subconsulta a movies corre con el RLS de quien inserta:
-- solo existen para él las películas que puede ver (publicadas, o todas si es admin)
create policy "watch_progress_insert_own"
  on public.watch_progress for insert
  to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.movies m where m.id = movie_id));

create policy "watch_progress_update_own"
  on public.watch_progress for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.movies m where m.id = movie_id));

create policy "watch_progress_delete_own"
  on public.watch_progress for delete
  to authenticated
  using (user_id = auth.uid());
