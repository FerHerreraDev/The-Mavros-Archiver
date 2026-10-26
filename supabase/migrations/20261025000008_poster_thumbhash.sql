-- =============================================================================
-- POSTER THUMBHASH (LOAD-02, LOAD-03 de tests/SPEC.md)
-- =============================================================================
-- Vista previa borrosa del póster (~25-35 bytes) en base64. La calcula el servidor
-- al guardar la película; web y Android la decodifican sin pedir nada más.
-- Las políticas RLS de movies ya cubren la columna nueva (son por fila).
-- =============================================================================

alter table public.movies add column if not exists poster_thumbhash text;

alter table public.movies drop constraint if exists movies_poster_thumbhash_format;
alter table public.movies add constraint movies_poster_thumbhash_format check (
  poster_thumbhash is null
  or (poster_thumbhash ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(poster_thumbhash) between 8 and 64)
);
