import { z } from 'zod'

export type MovieStatus = 'draft' | 'published'

export type Movie = {
  id: string
  slug: string
  title: string
  original_title: string | null
  synopsis: string | null
  release_year: number | null
  duration_seconds: number
  genres: string[]
  poster_url: string | null
  /** Vista previa borrosa del póster en base64 (LOAD-02) */
  poster_thumbhash: string | null
  /** Copia optimizada en el bucket `posters` (LOAD-07); si no hay, se usa poster_url */
  poster_image_url: string | null
  hls_path: string
  /** Episodio de una serie (SER-03): los tres juntos o null */
  series_id: string | null
  season_number: number | null
  episode_number: number | null
  status: MovieStatus
  created_by: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

/** "Chainsaw Man: Reze Arc" -> "chainsaw-man-reze-arc" (MOV-09) */
export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '')
}

/** "Acción, ANIME , acción" -> ["acción", "anime"] (MOV-10) */
export function normalizeGenres(input: string) {
  const seen = new Set<string>()
  for (const raw of input.split(',')) {
    const genre = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (genre) seen.add(genre)
  }
  return [...seen]
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))

export type Series = Omit<Movie, 'duration_seconds' | 'hls_path' | 'series_id' | 'season_number' | 'episode_number'>

const optionalInt = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null
      const n = Number(v)
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message })
        return z.NEVER
      }
      return n
    })

function withSlug<T extends { slug: string; title: string }>(data: T, ctx: z.RefinementCtx) {
  const slug = data.slug === '' ? slugify(data.title) : data.slug
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    ctx.addIssue({ code: 'custom', path: ['slug'], message: 'Slug: solo minúsculas, números y guiones (ej. mi-pelicula)' })
    return z.NEVER
  }
  return { ...data, slug }
}

/** Campos comunes de película y serie (MOV-05, SER-02) */
const catalogFields = {
  title: z.string().trim().min(1, 'El título es obligatorio').max(200, 'Título: máximo 200 caracteres'),
  slug: z.string().trim().toLowerCase(),
  original_title: optionalText(200, 'Título original'),
  synopsis: optionalText(2000, 'Sinopsis'),
  release_year: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null
      const year = Number(v)
      if (!Number.isInteger(year) || year < 1888 || year > 2100) {
        ctx.addIssue({ code: 'custom', message: 'Año entre 1888 y 2100' })
        return z.NEVER
      }
      return year
    }),
  genres: z.string().transform(normalizeGenres),
  poster_url: optionalText(500, 'Póster').refine((v) => v === null || /^https:\/\/\S+$/.test(v), 'El póster debe ser una URL https://'),
}

/** Formulario de serie (SER-05): lo mismo que una película sin video */
export const seriesFormSchema = z.object(catalogFields).transform(withSlug)
export type SeriesFormData = z.output<typeof seriesFormSchema>

/**
 * Campos del formulario de película (MOV-05, MOV-07) y, si se elige serie, de episodio (SER-06).
 * La duración NO está aquí: la calcula el servidor desde la playlist (MOV-08).
 */
export const movieFormSchema = z
  .object({
    ...catalogFields,
    series_id: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || z.uuid().safeParse(v).success, 'Serie inválida'),
    season_number: optionalInt(0, 999, 'Temporada entre 0 y 999'),
    episode_number: optionalInt(1, 9999, 'Episodio entre 1 y 9999'),
    hls_path: z
      .string()
      .trim()
      .transform((v) => v.replace(/^\/+/, ''))
      .refine((v) => /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.m3u8$/.test(v), 'Ruta relativa al bucket que termine en .m3u8 (ej. movies/mi-pelicula/master.m3u8)')
      .refine((v) => !/(^|\/)\.\.(\/|$)/.test(v), 'La ruta no puede contener ".."'),
  })
  .superRefine((data, ctx) => {
    if (data.series_id === null) return
    if (data.season_number === null) ctx.addIssue({ code: 'custom', path: ['season_number'], message: 'Falta la temporada' })
    if (data.episode_number === null) ctx.addIssue({ code: 'custom', path: ['episode_number'], message: 'Falta el número de episodio' })
  })
  .transform((data, ctx) => {
    const withSlugData = withSlug(data, ctx)
    // Sin serie, temporada y episodio no aplican (SER-03: los tres juntos o ninguno)
    return data.series_id === null ? { ...withSlugData, season_number: null, episode_number: null } : withSlugData
  })

export type MovieFormInput = z.input<typeof movieFormSchema>
export type MovieFormData = z.output<typeof movieFormSchema>

/** Slug de un episodio: "breaking-bad" T1 E2 -> "breaking-bad-s01e02" (SER-14) */
export function episodeSlug(seriesSlug: string, season: number, episode: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${seriesSlug.slice(0, 90).replace(/-+$/, '')}-s${pad(season)}e${pad(episode)}`
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

/** 754.2 -> "12:34", 3725 -> "1:02:05" (igual que formatTimestamp de Android) */
export function formatTimestamp(seconds: number) {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
