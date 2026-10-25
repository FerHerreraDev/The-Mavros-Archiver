import { describe, it, expect } from 'vitest'
import { clientIp } from '@/lib/client-ip'

const h = (entries: Record<string, string>) => new Headers(entries)

describe('clientIp (OPS-04)', () => {
  it('prefiere x-vercel-forwarded-for (lo pone Vercel, el cliente no lo controla)', () => {
    expect(clientIp(h({ 'x-vercel-forwarded-for': '9.9.9.9', 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9')
  })

  it('luego x-real-ip', () => {
    expect(clientIp(h({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('8.8.8.8')
  })

  it('de x-forwarded-for toma solo el PRIMER valor', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe('1.1.1.1')
  })

  it('valores agregados detrás no cambian la clave', () => {
    const a = clientIp(h({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }))
    const b = clientIp(h({ 'x-forwarded-for': '1.1.1.1, 10.0.0.2' }))
    expect(a).toBe(b)
  })

  it('espacios y valores vacíos', () => {
    expect(clientIp(h({ 'x-forwarded-for': '  1.1.1.1  ' }))).toBe('1.1.1.1')
    expect(clientIp(h({ 'x-forwarded-for': '' }))).toBe('unknown')
    expect(clientIp(h({}))).toBe('unknown')
  })
})
