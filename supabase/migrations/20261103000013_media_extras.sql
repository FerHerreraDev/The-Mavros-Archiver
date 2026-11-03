-- =============================================================================
-- DATOS PARA UNA PORTADA DE CINE (TMDB-06, TMDB-07 de tests/SPEC.md)
-- =============================================================================
-- - movies: imagen horizontal (como series, SER-17)
-- - movies y series: logo del título, tráiler de YouTube, reparto y color dominante
--   de la imagen horizontal (para teñir la portada)
--
-- Las políticas RLS de movies y series ya cubren las columnas nuevas (son por fila).
-- Android e iPad piden columnas explícitas: las nuevas no les cambian nada.
-- =============================================================================

alter table public.movies add column if not exists backdrop_url text;
alter table public.movies add column if not exists backdrop_image_url text;
alter table public.movies add column if not exists backdrop_thumbhash text;

alter table public.movies drop constraint if exists movies_backdrop_https;
alter table public.movies add constraint movies_backdrop_https check (backdrop_url is null or backdrop_url ~ '^https://');
alter table public.movies drop constraint if exists movies_backdrop_image_https;
alter table public.movies add constraint movies_backdrop_image_https check (backdrop_image_url is null or backdrop_image_url ~ '^https?://');
alter table public.movies drop constraint if exists movies_backdrop_thumbhash_format;
alter table public.movies add constraint movies_backdrop_thumbhash_format check (
  backdrop_thumbhash is null
  or (backdrop_thumbhash ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(backdrop_thumbhash) between 8 and 64)
);

-- Lo mismo en las dos tablas
do $$
declare
  t text;
begin
  foreach t in array array['movies', 'series'] loop
    -- Logo del título (PNG de TMDB) y su copia optimizada (WebP con transparencia)
    execute format('alter table public.%I add column if not exists logo_url text', t);
    execute format('alter table public.%I add column if not exists logo_image_url text', t);
    -- Clave del video de YouTube (lo que va después de watch?v=)
    execute format('alter table public.%I add column if not exists trailer_key text', t);
    -- Reparto principal: [{ "name", "character", "profile_url" }]
    execute format('alter table public.%I add column if not exists "cast" jsonb not null default ''[]''::jsonb', t);
    -- Color dominante de la imagen horizontal, "#rrggbb"
    execute format('alter table public.%I add column if not exists accent_color text', t);

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_logo_https');
    execute format('alter table public.%I add constraint %I check (logo_url is null or logo_url ~ ''^https://'')', t, t || '_logo_https');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_logo_image_https');
    execute format('alter table public.%I add constraint %I check (logo_image_url is null or logo_image_url ~ ''^https?://'')', t, t || '_logo_image_https');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_trailer_key_format');
    execute format('alter table public.%I add constraint %I check (trailer_key is null or trailer_key ~ ''^[A-Za-z0-9_-]{6,20}$'')', t, t || '_trailer_key_format');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_cast_format');
    execute format('alter table public.%I add constraint %I check (jsonb_typeof("cast") = ''array'' and jsonb_array_length("cast") <= 20)', t, t || '_cast_format');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_accent_color_format');
    execute format('alter table public.%I add constraint %I check (accent_color is null or accent_color ~ ''^#[0-9a-f]{6}$'')', t, t || '_accent_color_format');
  end loop;
end
$$;
