import { describe, it, expect } from 'vitest'
import { loginSchema, resetPasswordSchema, forgotPasswordSchema } from '@/lib/validations/auth.schema'

describe('loginSchema', () => {
  it('AUTH-03 acepta email y contraseña de 8+ caracteres', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true)
  })

  it.each(['', 'no-arroba', 'a@b', 'a @b.co', '@b.co', 'a@.co'])('AUTH-03 rechaza email inválido: %j', (email) => {
    const r = loginSchema.safeParse({ email, password: '12345678' })
    expect(r.success).toBe(false)
  })

  it('AUTH-01 normaliza el email: quita espacios y pasa a minúsculas', () => {
    const r = loginSchema.safeParse({ email: '  User@Example.COM ', password: '12345678' })
    expect(r.success).toBe(true)
    expect(r.data?.email).toBe('user@example.com')
  })

  it('AUTH-03 rechaza contraseña de 7 caracteres', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success).toBe(false)
  })

  it('AUTH-03 rechaza campos ausentes (FormData.get devuelve null)', () => {
    expect(loginSchema.safeParse({ email: null, password: null }).success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  const ok = (password: string, confirmPassword = password) =>
    resetPasswordSchema.safeParse({ password, confirmPassword }).success

  it('PWD-01 acepta 8 y 64 caracteres (límites)', () => {
    expect(ok('a'.repeat(8))).toBe(true)
    expect(ok('a'.repeat(64))).toBe(true)
  })

  it('PWD-01 rechaza 7 y 65 caracteres', () => {
    expect(ok('a'.repeat(7))).toBe(false)
    expect(ok('a'.repeat(65))).toBe(false)
  })

  it('PWD-01 rechaza si la confirmación no coincide, con el error en confirmPassword', () => {
    const r = resetPasswordSchema.safeParse({ password: 'correct-horse', confirmPassword: 'correct-horsE' })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path.join('.') === 'confirmPassword')).toBe(true)
  })

  it('PWD-01 rechaza confirmación vacía', () => {
    expect(ok('correct-horse', '')).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('acepta email válido', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
  })

  it('rechaza email inválido o vacío', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false)
    expect(forgotPasswordSchema.safeParse({ email: '' }).success).toBe(false)
  })
})
