import { describe, it, expect } from 'vitest'
import { DUPLICATE_REQUEST, TOO_MANY_REQUESTS, requestErrorMessage, sortForAdmin } from '@/lib/requests'

describe('pedidos', () => {
  it('REQ-02 el error de la base se explica', () => {
    expect(requestErrorMessage({ code: '23505' })).toBe(DUPLICATE_REQUEST)
    expect(requestErrorMessage({ code: 'P0001', message: 'too_many_requests' })).toBe(TOO_MANY_REQUESTS)
    expect(requestErrorMessage({ code: '42501' })).toBe('No se pudo enviar el pedido.')
  })

  it('REQ-05 primero los pendientes (más antiguo primero), luego los resueltos (más reciente primero)', () => {
    const r = (id: string, status: 'pending' | 'added' | 'rejected', created: string, resolved: string | null = null) => ({ id, status, created_at: created, resolved_at: resolved })
    const list = [
      r('done-old', 'added', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
      r('new', 'pending', '2026-10-20T00:00:00Z'),
      r('done-new', 'rejected', '2026-10-01T00:00:00Z', '2026-10-25T00:00:00Z'),
      r('old', 'pending', '2026-10-10T00:00:00Z'),
    ]
    expect(sortForAdmin(list).map((x) => x.id)).toEqual(['old', 'new', 'done-new', 'done-old'])
  })
})
