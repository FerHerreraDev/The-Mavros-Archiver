import { describe, it, expect } from 'vitest'
import { inviteErrorMessage } from '@/lib/auth/invite-errors'

const FALLBACK = 'Hubo un problema al enviar la invitación.'

describe('inviteErrorMessage (INV-03, INV-07)', () => {
  it('INV-07 límite de correos de Supabase → pide esperar', () => {
    expect(inviteErrorMessage({ code: 'over_email_send_rate_limit', status: 429 }, FALLBACK)).toMatch(/máximo de correos por hora/)
    expect(inviteErrorMessage({ status: 429 }, FALLBACK)).toMatch(/Espera un rato/)
  })

  it('INV-03 correo ya registrado → error claro que sugiere Reenviar', () => {
    expect(inviteErrorMessage({ code: 'email_exists', status: 422 }, FALLBACK)).toMatch(/registrado.*Reenviar/)
  })

  it('cualquier otro error → mensaje genérico', () => {
    expect(inviteErrorMessage({ code: 'unexpected_failure', status: 500 }, FALLBACK)).toBe(FALLBACK)
    expect(inviteErrorMessage(null, FALLBACK)).toBe(FALLBACK)
  })
})
