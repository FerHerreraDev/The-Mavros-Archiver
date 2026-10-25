import { describe, it, expect, vi } from 'vitest'

// El contador falla (base caída, migración sin correr, etc.)
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (...args: unknown[]) => ({ single: () => rpc(...args) }) }),
}))

const { ratelimit } = await import('@/lib/rate-limit')

describe('ratelimit falla cerrado (OPS-02)', () => {
  it('si la base responde error → bloquea', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function rate_limit_hit does not exist' } })
    expect((await ratelimit.limit('k')).success).toBe(false)
  })

  it('si la llamada lanza → bloquea', async () => {
    rpc.mockRejectedValueOnce(new Error('fetch failed'))
    expect((await ratelimit.limit('k')).success).toBe(false)
  })

  it('si responde sin datos → bloquea', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await ratelimit.limit('k')).success).toBe(false)
  })

  it('pasa la clave, el máximo (5) y la ventana (60 s) a la base', async () => {
    rpc.mockResolvedValueOnce({ data: { allowed: true, remaining: 4 }, error: null })
    expect(await ratelimit.limit('login:1.1.1.1')).toEqual({ success: true, remaining: 4 })
    expect(rpc).toHaveBeenLastCalledWith('rate_limit_hit', { p_key: 'login:1.1.1.1', p_max: 5, p_window_seconds: 60 })
  })
})
