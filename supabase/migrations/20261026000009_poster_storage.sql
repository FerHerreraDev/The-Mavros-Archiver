-- =============================================================================
-- COPIA OPTIMIZADA DEL PÓSTER (LOAD-07 de tests/SPEC.md)
-- =============================================================================
-- El servidor descarga el póster que pega el admin, lo reduce a WebP de 600 px y lo
-- sube aquí. Web y Android cargan esta copia (~50 KB) en vez de la imagen externa
-- (que puede pesar MB o desaparecer).
--
-- - Bucket público: la URL basta para leer (las tarjetas cargan sin firmar nada).
-- - SELECT en storage.objects solo para admins: los demás no pueden LISTAR el bucket.
-- - Solo admins (is_admin()) suben, reemplazan o borran.
-- =============================================================================

alter table public.movies add column if not exists poster_image_url text;

alter table public.movies drop constraint if exists movies_poster_image_https;
alter table public.movies add constraint movies_poster_image_https check (
  poster_image_url is null or poster_image_url ~ '^https?://'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "posters_insert_admin" on storage.objects;
drop policy if exists "posters_update_admin" on storage.objects;
drop policy if exists "posters_delete_admin" on storage.objects;
drop policy if exists "posters_select_admin" on storage.objects;

create policy "posters_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'posters' and public.is_admin());

-- upsert de un archivo que ya existe necesita poder leerlo y actualizarlo (solo admins)
create policy "posters_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'posters' and public.is_admin())
  with check (bucket_id = 'posters' and public.is_admin());

create policy "posters_select_admin"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'posters' and public.is_admin());

create policy "posters_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'posters' and public.is_admin());
