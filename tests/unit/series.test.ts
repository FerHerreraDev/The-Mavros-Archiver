import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { episodeLabel, nextEpisode, nextUp, seriesContinue, sortEpisodes, type EpisodeProgress, type EpisodeRef } from '@/lib/series'

// SER-13: los mismos casos los corre Android (SeriesRulesTest.kt)
type Cases = {
  episodes: EpisodeRef[]
  sorted: string[]
  nextEpisode: { current: string; expected: string | null }[]
  nextUp: { name: string; episodes?: EpisodeRef[]; progress: EpisodeProgress[]; expected: { id: string; action: string; startAt: number } | null }[]
  seriesContinue: { name: string; progress: EpisodeProgress[]; expected: { id: string; positionSeconds: number; updatedAt: string } | null }[]
}
const cases = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/series-cases.json'), 'utf8')) as Cases

describe('series: orden (SER-13)', () => {
  it('temporada y episodio ascendentes, especiales (T0) al final', () => {
    expect(sortEpisodes(cases.episodes).map((e) => e.id)).toEqual(cases.sorted)
  })

  it.each(cases.nextEpisode)('siguiente de $current = $expected', ({ current, expected }) => {
    expect(nextEpisode(cases.episodes, current)?.id ?? null).toBe(expected)
  })

  it('etiqueta T1:E2', () => {
    expect(episodeLabel(1, 2)).toBe('T1:E2')
  })
})

describe('series: qué sigue (SER-10)', () => {
  it.each(cases.nextUp)('$name', ({ episodes, progress, expected }) => {
    const result = nextUp(episodes ?? cases.episodes, progress)
    expect(result && { id: result.episode.id, action: result.action, startAt: result.startAt }).toEqual(expected)
  })
})

describe('series: seguir viendo (SER-11)', () => {
  it.each(cases.seriesContinue)('$name', ({ progress, expected }) => {
    const result = seriesContinue(cases.episodes, progress)
    expect(result && { id: result.episode.id, positionSeconds: result.positionSeconds, updatedAt: result.updatedAt }).toEqual(expected)
  })
})
