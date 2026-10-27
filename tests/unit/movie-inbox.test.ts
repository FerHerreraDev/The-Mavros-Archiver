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
