import { describe, it, expect } from 'vitest'
import { userStatus, isBanned } from '@/lib/user-status'

const now = new Date('2026-10-25T12:00:00Z')
const future = '2126-01-01T00:00:00Z'
const past = '2020-01-01T00:00:00Z'

describe('userStatus (ADM-05)', () => {
  it('usuario creado directamente, sin invitación → active', () => {
    expect(userStatus({ invited_at: undefined, user_metadata: {} }, now)).toBe('active')
  })

  it('invitado sin contraseña → pending', () => {
    expect(userStatus({ invited_at: past, user_metadata: {} }, now)).toBe('pending')
  })

  it('invitado que ya eligió contraseña → active', () => {
    expect(userStatus({ invited_at: past, user_metadata: { password_set: true } }, now)).toBe('active')
  })

  it('ban vigente → disabled, aunque esté pendiente', () => {
    expect(userStatus({ banned_until: future, invited_at: past, user_metadata: {} }, now)).toBe('disabled')
  })

  it('ban ya vencido → no cuenta como desactivado', () => {
    expect(userStatus({ banned_until: past, user_metadata: { password_set: true } }, now)).toBe('active')
    expect(isBanned({ banned_until: past }, now)).toBe(false)
  })

  it('sin banned_until → no está desactivado', () => {
    expect(isBanned({}, now)).toBe(false)
    expect(isBanned({ banned_until: null }, now)).toBe(false)
  })
})
