-- =============================================================================
-- RATE LIMIT EN POSTGRES (OPS-01..OPS-03 de tests/SPEC.md)
-- =============================================================================
-- En serverless (Vercel) cada instancia tiene su propia memoria: un contador en
-- memoria deja pasar N × instancias intentos. Aquí el contador es compartido.
--
-- Atómico: INSERT … ON CONFLICT DO UPDATE bloquea la fila mientras cuenta.
-- Ventana fija por clave (ej. "login:<ip>"): al vencer, vuelve a 1.
-- Solo el service role lo usa (Server Actions); los clientes no ven la tabla.
-- =============================================================================

create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         integer not null
);

alter table public.rate_limits enable row level security;
-- Sin policies: anon y authenticated no pueden leer ni escribir
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_expired_before timestamptz := now() - make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count        = case when r.window_start <= v_expired_before then 1 else r.count + 1 end,
    window_start = case when r.window_start <= v_expired_before then now() else r.window_start end
  returning r.count into v_count;

  -- Limpieza ocasional de claves viejas para que la tabla no crezca sin fin
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select v_count <= p_max, greatest(p_max - v_count, 0);
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
