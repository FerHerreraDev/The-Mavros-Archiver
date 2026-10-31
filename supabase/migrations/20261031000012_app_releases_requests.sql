-- =============================================================================
-- ACTUALIZACIONES DE LAS APPS ANDROID (UPD-01, UPD-02) Y PEDIDOS (REQ-01, REQ-02)
-- =============================================================================
-- app_releases: cada versión publicada con `pnpm android:release` (service role).
--   Los usuarios con sesión la leen para saber si hay que actualizar; nadie la escribe
--   desde el cliente.
-- apps (Storage): APK privados. Solo el servidor los firma (/api/app/latest).
-- movie_requests: lo que los usuarios piden ver. Cada quien ve los suyos; los admins
--   ven todos y les cambian el estado.
-- =============================================================================

create table if not exists public.app_releases (
  id            uuid primary key default gen_random_uuid(),
  app           text not null,
  version_code  integer not null,
  version_name  text not null,
  apk_path      text not null,
  sha256        text not null,
  created_at    timestamptz not null default now(),

  constraint app_releases_app check (app in ('mobile', 'tv')),
  constraint app_releases_version_code check (version_code > 0),
  constraint app_releases_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_releases_unique unique (app, version_code)
);

alter table public.app_releases enable row level security;

drop policy if exists "app_releases_select_authenticated" on public.app_releases;
create policy "app_releases_select_authenticated" on public.app_releases for select to authenticated using (true);
-- Sin políticas de escritura: solo la service role publica versiones

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apps', 'apps', false, 52428800, array['application/vnd.android.package-archive'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- Sin políticas en storage.objects para `apps`: ni usuarios ni admins lo leen o listan desde el cliente

-- Pedidos ---------------------------------------------------------------------
create table if not exists public.movie_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null,
  note         text,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,

  constraint movie_requests_title_length check (char_length(title) between 1 and 200 and title = btrim(title)),
  constraint movie_requests_note_length check (note is null or char_length(note) <= 500),
  constraint movie_requests_status check (status in ('pending', 'added', 'rejected'))
);

-- REQ-02: el mismo título dos veces pendiente para el mismo usuario no
create unique index if not exists movie_requests_pending_title_unique
  on public.movie_requests (user_id, lower(regexp_replace(title, '\s+', ' ', 'g')))
  where status = 'pending';
create index if not exists movie_requests_status_idx on public.movie_requests (status, created_at);

-- REQ-02: a lo más 20 pendientes por usuario
create or replace function public.movie_requests_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.movie_requests where user_id = new.user_id and status = 'pending') >= 20 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists movie_requests_limit on public.movie_requests;
create trigger movie_requests_limit
  before insert on public.movie_requests
  for each row execute function public.movie_requests_limit();

-- Al resolver (o reabrir) se anota cuándo
create or replace function public.movie_requests_resolved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.resolved_at := case when new.status = 'pending' then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists movie_requests_resolved_at on public.movie_requests;
create trigger movie_requests_resolved_at
  before update on public.movie_requests
  for each row execute function public.movie_requests_resolved_at();

alter table public.movie_requests enable row level security;

drop policy if exists "movie_requests_select" on public.movie_requests;
drop policy if exists "movie_requests_insert_own" on public.movie_requests;
drop policy if exists "movie_requests_update_admin" on public.movie_requests;
drop policy if exists "movie_requests_delete_own_pending" on public.movie_requests;

create policy "movie_requests_select" on public.movie_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "movie_requests_insert_own" on public.movie_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and resolved_at is null);
create policy "movie_requests_update_admin" on public.movie_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "movie_requests_delete_own_pending" on public.movie_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- Solo el estado cambia: el admin no reescribe lo que pidió el usuario
revoke update on public.movie_requests from authenticated;
grant update (status) on public.movie_requests to authenticated;
