-- =============================================================================
-- PROFILES + RLS
-- =============================================================================
-- Idempotente: se puede correr en un proyecto donde `profiles` ya existe.
-- Correr en Supabase Dashboard > SQL Editor (o `supabase db push`).
--
-- Modelo de seguridad:
-- - Cada usuario puede LEER su propio perfil.
-- - Los admins pueden LEER todos los perfiles.
-- - Nadie puede escribir desde el cliente (ni siquiera su propio perfil):
--   así un usuario no puede auto-promoverse a 'admin'. Los cambios de rol
--   se hacen solo desde Server Actions con el admin client (service role).
-- =============================================================================

-- 1. Tabla ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  role        text not null default 'user',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Por si la tabla ya existía con otras columnas
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists role       text not null default 'user';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Solo 'admin' o 'user'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user'));

-- 2. Helper is_admin() --------------------------------------------------------
-- SECURITY DEFINER para evitar recursión infinita de RLS
-- (una policy sobre profiles que consulta profiles).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3. RLS -----------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own"   on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- Sin policies de insert/update/delete: bloqueado para anon y authenticated.

-- 4. Trigger: crear perfil al crear usuario (signup o invitación) --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Trigger: updated_at -------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 6. Backfill: perfiles para usuarios que ya existían --------------------------
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

-- 7. Primer admin (descomenta y pon tu correo) ---------------------------------
-- update public.profiles set role = 'admin' where email = 'tu-correo@ejemplo.com';
