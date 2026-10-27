import { describe, it, expect } from 'vitest'
import { slugify as appSlugify } from '@/lib/movies'
import { parseFileName, isVideo, isStable, uniqueSlug, slugify, STABLE_MS } from '../../scripts/movie-inbox-lib.mjs'

describe('carpeta de entrada (VID-09)', () => {
  it.each([
    ['Perfect Blue (1997).mkv', 'Perfect Blue', 1997, 'perfect-blue'],
    ['Akira.1988.mp4', 'Akira', 1988, 'akira'],
    ['Chainsaw Man - The Movie Reze Arc [2025].mkv', 'Chainsaw Man - The Movie Reze Arc', 2025, 'chainsaw-man-the-movie-reze-arc'],
    ['El_Laberinto_del_Fauno_2006.mov', 'El Laberinto del Fauno', 2006, 'el-laberinto-del-fauno'],
    ['Película sin año.mp4', 'Película sin año', null, 'pelicula-sin-ano'],
    ['2001 A Space Odyssey.mkv', '2001 A Space Odyssey', null, '2001-a-space-odyssey'],
  ])('%s → título, año y slug', (file, title, year, slug) => {
    expect(parseFileName(file)).toEqual({ title, year, slug })
  })

  it('el slug es el mismo que genera la app (MOV-09)', () => {
    for (const t of ['Perfect Blue', 'Ñandú: Ácido', '  Hola -- Mundo!  ', 'x'.repeat(150)]) expect(slugify(t)).toBe(appSlugify(t))
  })

  it('solo videos; ignora ocultos y otros archivos', () => {
    expect(['a.mkv', 'b.MP4', 'c.mov', 'd.m4v', 'e.avi'].every(isVideo)).toBe(true)
    expect(['notas.txt', '.DS_Store', '.parcial.mkv', 'poster.jpg', 'sinextension'].some(isVideo)).toBe(false)
  })

  it('solo se procesa cuando terminó de copiarse', () => {
    const now = 1_000_000
    const old = now - STABLE_MS
    expect(isStable(undefined, { size: 10, mtimeMs: old }, now), 'primera vez que se ve').toBe(false)
    expect(isStable({ size: 5 }, { size: 10, mtimeMs: old }, now), 'sigue creciendo').toBe(false)
    expect(isStable({ size: 10 }, { size: 10, mtimeMs: now - 1000 }, now), 'cambió hace poco').toBe(false)
    expect(isStable({ size: 0 }, { size: 0, mtimeMs: old }, now), 'vacío').toBe(false)
    expect(isStable({ size: 10 }, { size: 10, mtimeMs: old }, now)).toBe(true)
  })

  it('slug repetido → -2, -3…', () => {
    expect(uniqueSlug('akira', new Set())).toBe('akira')
    expect(uniqueSlug('akira', new Set(['akira']))).toBe('akira-2')
    expect(uniqueSlug('akira', new Set(['akira', 'akira-2']))).toBe('akira-3')
  })
})

import { encodeFraction, remainingMs, formatRemaining, bar, parseRcloneStats, statusFileName } from '../../scripts/movie-inbox-lib.mjs'

describe('avance de la carpeta de entrada (VID-10)', () => {
  it('fracción convertida por segmentos de 6 s escritos', () => {
    expect(encodeFraction(0, 600)).toBe(0)
    expect(encodeFraction(50, 600)).toBe(0.5)
    expect(encodeFraction(200, 600)).toBe(1)
    expect(encodeFraction(10, 0)).toBe(0)
  })

  it('tiempo restante proporcional a lo que tardó lo hecho', () => {
    expect(remainingMs(0.25, 10 * 60_000)).toBe(30 * 60_000)
    expect(remainingMs(0.005, 60_000), 'muy pronto para estimar').toBeNull()
    expect(remainingMs(1, 60_000)).toBe(0)
  })

  it('texto del tiempo restante', () => {
    expect(formatRemaining(null)).toBe('calculando…')
    expect(formatRemaining(10_000)).toBe('~1 min')
    expect(formatRemaining(32 * 60_000)).toBe('~32 min')
    expect(formatRemaining(185 * 60_000)).toBe('~3 h 5 min')
    expect(formatRemaining(120 * 60_000)).toBe('~2 h')
  })

  it('barra de 10 casillas', () => {
    expect(bar(0)).toBe('░░░░░░░░░░')
    expect(bar(0.45)).toBe('▓▓▓▓▓░░░░░')
    expect(bar(1.2)).toBe('▓▓▓▓▓▓▓▓▓▓')
  })

  it('lee el avance de la subida de rclone', () => {
    expect(parseRcloneStats('  1.209 GiB / 3.400 GiB, 35%, 10.2 MiB/s, ETA 3m40s')).toEqual({ fraction: 0.35, eta: '3m40s' })
    expect(parseRcloneStats('2026/10/26 Transferred: 0 B / 0 B, -, 0 B/s, ETA -')).toBeNull()
  })

  it('el nombre del archivo de estado muestra paso, barra, % y tiempo, sin caracteres prohibidos', () => {
    const name = statusFileName('Película: 2/3', 'convirtiendo', 0.45, 32 * 60_000)
    expect(name).toBe('⏳ Película- 2-3 — convirtiendo ▓▓▓▓▓░░░░░ 45% · faltan ~32 min.txt')
    expect(name).not.toMatch(/[/:]/)
  })
})

import { parseEpisode, episodeSlug } from '../../scripts/movie-inbox-lib.mjs'
import { episodeSlug as appEpisodeSlug } from '@/lib/movies'

describe('episodios en la carpeta de entrada (SER-14)', () => {
  const bb = { title: 'Breaking Bad', year: 2008, slug: 'breaking-bad' }
  const bbNoYear = { ...bb, year: null }

  it.each([
    ["Breaking Bad (2008) - S01E02 - Cat's in the Bag.mkv", bb, 1, 2, "Cat's in the Bag"],
    ['Breaking.Bad.S01E02.mkv', bbNoYear, 1, 2, 'Episodio 2'],
    ['Breaking.Bad.s01e02.720p.BluRay.x264.mkv', bbNoYear, 1, 2, 'Episodio 2'],
    ['Breaking Bad (2008)/S01E02.mkv', bb, 1, 2, 'Episodio 2'],
    ['Breaking Bad (2008)/Temporada 1/S01E03 - And the Bag\'s in the River.mkv', bb, 1, 3, "And the Bag's in the River"],
    ['Breaking Bad/1x07 - A No-Rough-Stuff-Type Deal.mp4', bbNoYear, 1, 7, 'A No-Rough-Stuff-Type Deal'],
    ['Breaking Bad - S00E01 - Especial.mkv', bbNoYear, 0, 1, 'Especial'],
  ])('%s → serie, temporada, episodio y título', (file, series, season, episode, title) => {
    expect(parseEpisode(file)).toEqual({ series, season, episode, title })
  })

  it('la serie del nombre del archivo manda sobre la carpeta', () => {
    expect(parseEpisode('Varias/Dark - S01E01.mkv')).toMatchObject({ series: { title: 'Dark', slug: 'dark' } })
  })

  it('sin S01E02 ni 1x02 no es episodio (película)', () => {
    for (const f of ['Perfect Blue (1997).mkv', 'Peliculas/Akira (1988).mkv', '2001 A Space Odyssey.mkv']) expect(parseEpisode(f)).toBeNull()
  })

  it('sin nombre de serie ni carpeta → error claro', () => {
    expect(parseEpisode('S01E02.mkv')).toEqual({ error: expect.stringMatching(/de qué serie/) })
  })

  it('el slug del episodio es el mismo que genera la app', () => {
    expect(episodeSlug('breaking-bad', 1, 2)).toBe('breaking-bad-s01e02')
    expect(episodeSlug('x', 12, 105)).toBe('x-s12e105')
    for (const [s, a, b] of [['breaking-bad', 1, 2], ['y'.repeat(100), 3, 4], ['a-', 0, 1]] as const) {
      expect(episodeSlug(s, a, b)).toBe(appEpisodeSlug(s, a, b))
    }
  })
})
