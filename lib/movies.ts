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
  hls_path: string
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

/**
 * Campos del formulario de película (MOV-05, MOV-07).
 * La duración NO está aquí: la calcula el servidor desde la playlist (MOV-08).
 */
export const movieFormSchema = z
  .object({
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
    hls_path: z
      .string()
      .trim()
      .transform((v) => v.replace(/^\/+/, ''))
      .refine((v) => /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.m3u8$/.test(v), 'Ruta relativa al bucket que termine en .m3u8 (ej. movies/mi-pelicula/master.m3u8)')
      .refine((v) => !/(^|\/)\.\.(\/|$)/.test(v), 'La ruta no puede contener ".."'),
  })
  .transform((data, ctx) => {
    const slug = data.slug === '' ? slugify(data.title) : data.slug
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
      ctx.addIssue({ code: 'custom', path: ['slug'], message: 'Slug: solo minúsculas, números y guiones (ej. mi-pelicula)' })
      return z.NEVER
    }
    return { ...data, slug }
  })

export type MovieFormInput = z.input<typeof movieFormSchema>
export type MovieFormData = z.output<typeof movieFormSchema>

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}
