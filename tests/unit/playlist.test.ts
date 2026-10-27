import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { nextInPlaylist, playlistStart, type ListEntry } from '@/lib/playlist'
import type { EpisodeProgress, EpisodeRef } from '@/lib/series'

// PL-05 / PL-06: los mismos casos los corre Android (PlaylistRulesTest.kt)
type Expected = { id: string; startAt: number } | null
type Cases = {
  movies: EpisodeRef[]
  series: Record<string, EpisodeRef[]>
  entries: string[]
  start: { name: string; entries?: string[]; progress: EpisodeProgress[]; expected: Expected }[]
  next: { name: string; current: string; progress: EpisodeProgress[]; expected: Expected }[]
}
const cases = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/playlist-cases.json'), 'utf8')) as Cases

const entries = (keys: string[]): ListEntry<EpisodeRef>[] =>
  keys.map((k) => (k in cases.series ? { seriesId: k, episodes: cases.series[k] } : { movie: cases.movies.find((m) => m.id === k)! }))
const simple = (pick: { episode: EpisodeRef; startAt: number } | null) => pick && { id: pick.episode.id, startAt: pick.startAt }

describe('listas: reproducir lista (PL-05)', () => {
  it.each(cases.start)('$name', ({ entries: keys, progress, expected }) => {
    expect(simple(playlistStart(entries(keys ?? cases.entries), progress))).toEqual(expected)
  })
})

describe('listas: siguiente en la lista (PL-06)', () => {
  it.each(cases.next)('$name', ({ current, progress, expected }) => {
    expect(simple(nextInPlaylist(entries(cases.entries), current, progress))).toEqual(expected)
  })
})
