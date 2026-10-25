import { describe, it, expect } from 'vitest'
import { slugify, normalizeGenres, movieFormSchema, formatDuration, type MovieFormInput } from '@/lib/movies'

const base: MovieFormInput = {
  title: 'Chainsaw Man: Reze Arc',
  slug: '',
  original_title: '',
  synopsis: '',
  release_year: '',
  genres: '',
  poster_url: '',
  hls_path: 'movies/chainsaw-man-reze-arc/master.m3u8',
}
const parse = (overrides: Partial<MovieFormInput>) => movieFormSchema.safeParse({ ...base, ...overrides })
const fieldError = (overrides: Partial<MovieFormInput>, field: string) => {
  const r = parse(overrides)
  return !r.success && r.error.issues.some((i) => i.path[0] === field)
}

describe('slugify (MOV-09)', () => {
  it.each([
    ['Chainsaw Man: Reze Arc', 'chainsaw-man-reze-arc'],
    ['El Laberinto del Fauno', 'el-laberinto-del-fauno'],
    ['Amélie', 'amelie'],
    ['  ¿Quién es?  ', 'quien-es'],
    ['2001: A Space Odyssey', '2001-a-space-odyssey'],
    ['A -- B', 'a-b'],
  ])('%j → %j', (title, slug) => {
    expect(slugify(title)).toBe(slug)
  })

  it('nunca pasa de 100 caracteres ni termina en guion', () => {
    const s = slugify('palabra '.repeat(40))
    expect(s.length).toBeLessThanOrEqual(100)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('normalizeGenres (MOV-10)', () => {
  it('minúsculas, sin espacios sobrantes, sin repetidos, sin vacíos', () => {
    expect(normalizeGenres('Anime,  ACCIÓN , acción,, ciencia   ficción ')).toEqual(['anime', 'acción', 'ciencia ficción'])
  })
  it('vacío → []', () => {
    expect(normalizeGenres('')).toEqual([])
    expect(normalizeGenres(' , ')).toEqual([])
  })
})

describe('movieFormSchema (MOV-05, MOV-07, MOV-09)', () => {
  it('slug vacío se genera del título', () => {
    const r = parse({})
    expect(r.success && r.data.slug).toBe('chainsaw-man-reze-arc')
  })

  it('slug escrito se respeta (normalizado a minúsculas)', () => {
    const r = parse({ slug: 'Reze' })
    expect(r.success && r.data.slug).toBe('reze')
  })

  it.each(['con espacios', 'acentó', 'guion-final-', '-inicio', 'doble--guion'])('slug inválido %j → error en slug', (slug) => {
    expect(fieldError({ slug }, 'slug')).toBe(true)
  })

  it('título obligatorio y máximo 200', () => {
    expect(fieldError({ title: '   ' }, 'title')).toBe(true)
    expect(fieldError({ title: 'a'.repeat(201) }, 'title')).toBe(true)
  })

  it.each(['1887', '2101', '1999.5', 'abc'])('año %j fuera de rango o no entero → error', (release_year) => {
    expect(fieldError({ release_year }, 'release_year')).toBe(true)
  })

  it('año vacío → null; año válido → número', () => {
    const empty = parse({})
    const year = parse({ release_year: '2025' })
    expect(empty.success && empty.data.release_year).toBeNull()
    expect(year.success && year.data.release_year).toBe(2025)
  })

  it.each(['http://inseguro.com/p.jpg', 'ftp://x/p.jpg', 'no-es-url'])('póster %j → error', (poster_url) => {
    expect(fieldError({ poster_url }, 'poster_url')).toBe(true)
  })

  it.each([
    'https://evil.com/master.m3u8',
    'movies/../secret/master.m3u8',
    '../master.m3u8',
    'movies/peli/video.mp4',
    'movies/peli con espacios/master.m3u8',
    '',
  ])('hls_path %j → error', (hls_path) => {
    expect(fieldError({ hls_path }, 'hls_path')).toBe(true)
  })

  it('hls_path con "/" inicial se acepta sin la barra', () => {
    const r = parse({ hls_path: '/movies/peli/master.m3u8' })
    expect(r.success && r.data.hls_path).toBe('movies/peli/master.m3u8')
  })

  it('campos opcionales vacíos → null; sinopsis > 2000 → error', () => {
    const r = parse({})
    expect(r.success && [r.data.original_title, r.data.synopsis, r.data.poster_url]).toEqual([null, null, null])
    expect(fieldError({ synopsis: 'x'.repeat(2001) }, 'synopsis')).toBe(true)
  })

  it('géneros se normalizan', () => {
    const r = parse({ genres: 'Anime, anime, Romance' })
    expect(r.success && r.data.genres).toEqual(['anime', 'romance'])
  })
})

describe('formatDuration', () => {
  it.each([
    [5952, '1 h 39 min'],
    [3600, '1 h 0 min'],
    [1500, '25 min'],
    [22, '22 s'],
    [59, '59 s'],
  ])('%i s → %j', (s, text) => {
    expect(formatDuration(s)).toBe(text)
  })
})
