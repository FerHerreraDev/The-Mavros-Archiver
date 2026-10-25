import { describe, it, expect } from 'vitest'
import { resumePosition, isInProgress, progressRatio } from '@/lib/progress'

describe('resumePosition (PRG-02)', () => {
  const D = 6000
  it.each([
    [null, 0],
    [0, 0],
    [9.9, 0], // recién empezada
    [10, 10],
    [3000, 3000],
    [5699, 5699], // 94.98 %
    [5700, 0], // 95 % = terminada
    [6000, 0],
  ])('posición %j de %i s → arranca en %j', (pos, expected) => {
    expect(resumePosition(pos as number | null, D)).toBe(expected)
  })

  it('duración inválida → 0', () => {
    expect(resumePosition(100, 0)).toBe(0)
  })
})

describe('isInProgress (CAT-06)', () => {
  it.each([
    [0, false],
    [299, false], // 4.98 %
    [300, true], // 5 %
    [5699, true],
    [5700, false], // 95 %
  ])('%i s de 6000 → %j', (pos, expected) => {
    expect(isInProgress(pos, 6000)).toBe(expected)
  })
})

describe('progressRatio', () => {
  it('se limita a 0..1', () => {
    expect(progressRatio(-5, 100)).toBe(0)
    expect(progressRatio(50, 100)).toBe(0.5)
    expect(progressRatio(500, 100)).toBe(1)
    expect(progressRatio(5, 0)).toBe(0)
  })
})
