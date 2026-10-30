import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pickTrack } from '@/lib/video/track-preference'

// Mismos casos que Android (TrackRulesTest)
const { cases } = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/track-cases.json'), 'utf8')) as {
  cases: { name: string; tracks: (string | null)[]; saved: string | null; expected: number }[]
}

describe('WATCH-05 idioma recordado', () => {
  it.each(cases)('$name', ({ tracks, saved, expected }) => {
    expect(pickTrack(tracks.map((lang) => ({ lang })), saved)).toBe(expected)
  })
})
