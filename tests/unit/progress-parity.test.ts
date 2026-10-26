import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resumePosition, isInProgress } from '@/lib/progress'

// MOB-10: los mismos casos los corre la app Android (ProgressRulesTest.kt)
type Case<T> = { position: number | null; duration: number; expected: T }
const cases = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/progress-cases.json'), 'utf8')) as {
  resumePosition: Case<number>[]
  isInProgress: Case<boolean>[]
}

describe('reglas de progreso: casos compartidos con Android (MOB-10)', () => {
  it.each(cases.resumePosition)('resumePosition($position, $duration) = $expected', ({ position, duration, expected }) => {
    expect(resumePosition(position, duration)).toBe(expected)
  })
  it.each(cases.isInProgress)('isInProgress($position, $duration) = $expected', ({ position, duration, expected }) => {
    expect(isInProgress(position ?? 0, duration)).toBe(expected)
  })
})
