-- =============================================================================
-- REVOCAR SESIONES DE UN USUARIO
-- =============================================================================
-- Al desactivar a alguien no basta con el ban: sus sesiones siguen existiendo y
-- "reviven" si se le reactiva. Esta función las borra (los refresh tokens caen
-- en cascada y Auth rechaza los access tokens de sesiones que ya no existen).
--
-- Solo la puede ejecutar el service role (Server Actions con el admin client).
-- =============================================================================

create or replace function public.revoke_user_sessions(target_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = target_user_id;
$$;

-- Supabase da EXECUTE a anon/authenticated por defecto en funciones nuevas de public
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
