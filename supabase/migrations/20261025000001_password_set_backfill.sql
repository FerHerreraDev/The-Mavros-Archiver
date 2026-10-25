-- =============================================================================
-- BACKFILL password_set
-- =============================================================================
-- El middleware manda a /set-password a todo usuario invitado (invited_at)
-- que no tenga user_metadata.password_set = true.
-- Marca como "ya tiene contraseña" a los usuarios existentes que sí la tienen,
-- para que no se les obligue a cambiarla.
-- =============================================================================

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"password_set": true}'::jsonb
where encrypted_password is not null
  and encrypted_password <> ''
  and coalesce(raw_user_meta_data ->> 'password_set', 'false') <> 'true';
