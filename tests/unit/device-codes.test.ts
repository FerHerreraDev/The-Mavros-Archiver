import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  USER_CODE_ALPHABET,
  generateUserCode,
  normalizeUserCode,
  formatUserCode,
  generateDeviceCode,
  hashDeviceCode,
  sanitizeClientName,
} from '@/lib/device-codes'

describe('user_code (DEV-01)', () => {
  it('el alfabeto no tiene caracteres confundibles', () => {
    for (const ch of '0O1IL') expect(USER_CODE_ALPHABET).not.toContain(ch)
  })

  it('8 caracteres, solo del alfabeto', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateUserCode()
      expect(code).toMatch(new RegExp(`^[${USER_CODE_ALPHABET}]{8}$`))
    }
  })

  it('descarta bytes que causarían sesgo de módulo (muestreo por rechazo)', () => {
    // 248..255 deben ignorarse con 31 símbolos (256 - 256 % 31 = 248)
    let call = 0
    const fake = () => (call++ === 0 ? new Uint8Array(16).fill(255) : new Uint8Array(16).fill(0))
    expect(generateUserCode(fake)).toBe('AAAAAAAA')
  })

  it('distribución aproximadamente uniforme', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) for (const ch of generateUserCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    const expected = (4000 * 8) / USER_CODE_ALPHABET.length
    for (const ch of USER_CODE_ALPHABET) {
      expect(counts.get(ch)).toBeGreaterThan(expected * 0.8)
      expect(counts.get(ch)).toBeLessThan(expected * 1.2)
    }
  })

  it('formato XXXX-XXXX', () => {
    expect(formatUserCode('K7Q4MX2P')).toBe('K7Q4-MX2P')
  })
})

describe('normalizeUserCode (DEV-03)', () => {
  it.each(['K7Q4-MX2P', 'k7q4-mx2p', 'K7Q4MX2P', ' k7q4 mx2p ', 'k7q4 - mx2p'])('%j → K7Q4MX2P', (input) => {
    expect(normalizeUserCode(input)).toBe('K7Q4MX2P')
  })

  it.each([null, undefined, '', 'K7Q4-MX2', 'K7Q4-MX2PP', 'K0Q4-MX2P', 'KOQ4-MX2P', 'K1Q4-MX2P', 'KIQ4-MX2P', 'KLQ4-MX2P', 'K7Q4_MX2P'])(
    'inválido %j → null',
    (input) => {
      expect(normalizeUserCode(input)).toBeNull()
    }
  )
})

describe('device_code (DEV-01, DEV-07)', () => {
  it('≥ 256 bits: 43 caracteres base64url y nunca se repite', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateDeviceCode))
    expect(codes.size).toBe(1000)
    for (const c of codes) expect(c).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('el hash es SHA-256 en hex y distinto del código', async () => {
    const code = generateDeviceCode()
    const hash = await hashDeviceCode(code)
    expect(hash).toBe(createHash('sha256').update(code).digest('hex'))
    expect(hash).not.toContain(code)
  })
})

describe('sanitizeClientName', () => {
  it('quita caracteres de control y de dirección de texto, recorta a 60', () => {
    expect(sanitizeClientName('Hisense\u0000 Google TV\u202e')).toBe('Hisense Google TV')
    expect(sanitizeClientName('x'.repeat(100))).toHaveLength(60)
  })
  it.each([undefined, null, 42, '', '   ', '\u0000'])('%j → "TV"', (input) => {
    expect(sanitizeClientName(input)).toBe('TV')
  })
})
