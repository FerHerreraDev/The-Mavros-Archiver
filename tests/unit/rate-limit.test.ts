import { describe, it, expect, vi, afterEach } from 'vitest'
import { ratelimit } from '@/lib/rate-limit'

// AUTH-04: 5 intentos por clave por minuto
describe('ratelimit', () => {
  afterEach(() => vi.useRealTimers())

  it('AUTH-04 permite 5 intentos y bloquea el 6º', async () => {
    const key = `unit:${Math.random()}`
    const results = []
    for (let i = 0; i < 6; i++) results.push((await ratelimit.limit(key)).success)
    expect(results).toEqual([true, true, true, true, true, false])
  })

  it('AUTH-04 claves distintas no se afectan entre sí', async () => {
    const a = `unit:a:${Math.random()}`
    const b = `unit:b:${Math.random()}`
    for (let i = 0; i < 6; i++) await ratelimit.limit(a)
    expect((await ratelimit.limit(b)).success).toBe(true)
  })

  it('AUTH-04 se libera cuando pasa el minuto', async () => {
    vi.useFakeTimers()
    const key = `unit:window:${Math.random()}`
    for (let i = 0; i < 6; i++) await ratelimit.limit(key)
    expect((await ratelimit.limit(key)).success).toBe(false)

    vi.advanceTimersByTime(60_001)
    expect((await ratelimit.limit(key)).success).toBe(true)
  })
})
