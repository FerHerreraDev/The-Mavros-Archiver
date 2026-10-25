import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const requestHeaders = { current: new Headers() }
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }))

const { getSiteUrl } = await import('@/lib/site-url')

describe('getSiteUrl (UTIL-01)', () => {
  beforeEach(() => {
    requestHeaders.current = new Headers()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('usa NEXT_PUBLIC_SITE_URL cuando existe, aunque haya origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mavros.example')
    requestHeaders.current.set('origin', 'https://otro.example')
    expect(await getSiteUrl()).toBe('https://mavros.example')
  })

  it('quita la "/" final de NEXT_PUBLIC_SITE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mavros.example/')
    expect(await getSiteUrl()).toBe('https://mavros.example')
  })

  it('sin variable, usa el origin del request', async () => {
    requestHeaders.current.set('origin', 'https://desde-origin.example')
    expect(await getSiteUrl()).toBe('https://desde-origin.example')
  })

  it('sin origin, usa x-forwarded-host + x-forwarded-proto', async () => {
    requestHeaders.current.set('x-forwarded-host', 'proxy.example')
    requestHeaders.current.set('x-forwarded-proto', 'https')
    requestHeaders.current.set('host', 'interno:3000')
    expect(await getSiteUrl()).toBe('https://proxy.example')
  })

  it('sin nada, http://localhost:3000', async () => {
    expect(await getSiteUrl()).toBe('http://localhost:3000')
  })
})
