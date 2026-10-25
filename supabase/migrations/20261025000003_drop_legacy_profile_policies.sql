-- =============================================================================
-- QUITAR POLÍTICAS VIEJAS DE profiles
-- =============================================================================
-- Producción tenía dos políticas de una versión anterior del proyecto.
-- "Admins can view all profiles" consulta profiles dentro de una policy de
-- profiles -> "infinite recursion detected in policy" y TODA lectura de profiles
-- falla (la app veía a todos como 'user'). Las reemplazan profiles_select_own
-- y profiles_select_admin (que usa is_admin(), SECURITY DEFINER, sin recursión).
-- =============================================================================

drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can view their own profile" on public.profiles;
