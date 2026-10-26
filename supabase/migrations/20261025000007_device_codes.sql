-- =============================================================================
-- LOGIN POR CÓDIGO PARA TV (DEV-01..DEV-11 de tests/SPEC.md, RFC 8628)
-- =============================================================================
-- Solo el servidor (service role) toca esta tabla. Se guarda el HASH del
-- device_code: si la tabla se filtrara, los códigos no se podrían canjear.
--
-- Estados: pending -> approved -> consumed   |   pending -> denied
-- =============================================================================

create table if not exists public.device_codes (
  id                uuid primary key default gen_random_uuid(),
  device_code_hash  text not null unique,
  -- 8 caracteres sin guion, alfabeto sin 0/O/1/I/L
  user_code         text not null,
  client_name       text not null default 'TV',
  status            text not null default 'pending',
  user_id           uuid references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  decided_at        timestamptz,
  last_polled_at    timestamptz,
  constraint device_codes_status check (status in ('pending', 'approved', 'denied', 'consumed')),
  constraint device_codes_user_code_format check (user_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  constraint device_codes_client_name_length check (char_length(client_name) between 1 and 60),
  constraint device_codes_decision check ((status = 'pending') = (user_id is null))
);

-- Un user_code no se repite entre códigos vivos
create unique index if not exists device_codes_live_user_code
  on public.device_codes (user_code) where status in ('pending', 'approved');

alter table public.device_codes enable row level security;
-- Sin policies: anon y authenticated no pueden leer ni escribir
revoke all on public.device_codes from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sondeo de la tele: decide la respuesta y, si está aprobado, lo consume.
-- Todo con la fila bloqueada (FOR UPDATE): dos sondeos simultáneos no pueden
-- recibir la misma sesión (DEV-04).
-- -----------------------------------------------------------------------------
create or replace function public.device_code_poll(p_hash text, p_min_interval_seconds integer)
returns table (result text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.device_codes%rowtype;
begin
  select * into rec from public.device_codes d where d.device_code_hash = p_hash for update;

  if not found or rec.status = 'consumed' then
    return query select 'invalid_grant'::text, null::uuid;
    return;
  end if;

  if rec.status = 'denied' then
    return query select 'access_denied'::text, null::uuid;
    return;
  end if;

  if rec.expires_at <= now() then
    return query select 'expired_token'::text, null::uuid;
    return;
  end if;

  if rec.last_polled_at is not null and now() - rec.last_polled_at < make_interval(secs => p_min_interval_seconds) then
    update public.device_codes set last_polled_at = now() where id = rec.id;
    return query select 'slow_down'::text, null::uuid;
    return;
  end if;

  if rec.status = 'pending' then
    update public.device_codes set last_polled_at = now() where id = rec.id;
    return query select 'authorization_pending'::text, null::uuid;
    return;
  end if;

  -- approved -> consumed (una sola vez)
  update public.device_codes set status = 'consumed', last_polled_at = now() where id = rec.id;

  -- Limpieza ocasional de códigos viejos
  if random() < 0.05 then
    delete from public.device_codes where expires_at < now() - interval '1 day';
  end if;

  return query select 'approved'::text, rec.user_id;
end;
$$;

revoke all on function public.device_code_poll(text, integer) from public, anon, authenticated;
grant execute on function public.device_code_poll(text, integer) to service_role;
