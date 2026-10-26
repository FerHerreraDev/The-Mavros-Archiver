import { describe, it, expect, vi } from 'vitest'
import {
  fetchPosterBytes,
  isPrivateAddress,
  PosterFetchError,
  POSTER_MAX_BYTES,
  POSTER_TIMEOUT_MS,
  type Lookup,
} from '@/lib/poster/fetch-poster'

// LOAD-05: el servidor solo descarga pósters por https, ≤15 MB, image/*, <10 s, nunca de la red interna
const PUBLIC_IP = '151.101.1.140'
const publicLookup: Lookup = async () => [{ address: PUBLIC_IP }]
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const imageResponse = (body: BodyInit | null = png(), headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'image/png', ...headers } })
const neverFetch = () => vi.fn<typeof fetch>(() => Promise.reject(new Error('no debía llamarse')))

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '127.8.9.10', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '[::1]', 'no-es-ip',
  ])('%s es local/privada', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', PUBLIC_IP, '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('%s es pública', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

describe('fetchPosterBytes', () => {
  it('https público con image/* → devuelve los bytes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse())
    const bytes = await fetchPosterBytes('https://image.tmdb.org/p.png', { fetchImpl, lookup: publicLookup })
    expect([...bytes]).toEqual([...png()])
  })

  it.each([
    ['http://image.tmdb.org/p.png', 'https'],
    ['ftp://image.tmdb.org/p.png', 'https'],
    ['https://user:pass@image.tmdb.org/p.png', 'usuario'],
    ['https://localhost/p.png', 'local'],
    ['https://api.localhost/p.png', 'local'],
    ['https://127.0.0.1/p.png', 'privada'],
    ['https://169.254.169.254/latest/meta-data', 'privada'],
    ['https://[::1]/p.png', 'privada'],
    ['https://[::ffff:127.0.0.1]/p.png', 'privada'],
    ['no es url', 'inválida'],
  ])('%s → rechazada sin conectarse', async (url, reason) => {
    const fetchImpl = neverFetch()
    await expect(fetchPosterBytes(url, { fetchImpl, lookup: publicLookup })).rejects.toThrow(new RegExp(reason, 'i'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('un nombre que resuelve a una IP privada → rechazado', async () => {
    const fetchImpl = neverFetch()
    const lookup: Lookup = async () => [{ address: '10.0.0.7' }]
    await expect(fetchPosterBytes('https://interno.example.com/p.png', { fetchImpl, lookup })).rejects.toBeInstanceOf(PosterFetchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('un nombre con una IP pública y otra privada → rechazado', async () => {
    const fetchImpl = neverFetch()
    const lookup: Lookup = async () => [{ address: PUBLIC_IP }, { address: '192.168.0.2' }]
    await expect(fetchPosterBytes('https://mixto.example.com/p.png', { fetchImpl, lookup })).rejects.toBeInstanceOf(PosterFetchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('un nombre que no resuelve → rechazado', async () => {
    const lookup: Lookup = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(fetchPosterBytes('https://no-existe.example/p.png', { fetchImpl: neverFetch(), lookup })).rejects.toBeInstanceOf(PosterFetchError)
  })

  it('una redirección hacia la red interna → rechazada (cada salto se valida)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } }))
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })).rejects.toThrow(/privada/i)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('una redirección a http → rechazada', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 301, headers: { location: 'http://cdn.example.com/p.png' } }))
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })).rejects.toThrow(/https/i)
  })

  it('sigue hasta 3 redirecciones públicas; la cuarta se rechaza', async () => {
    let n = 0
    const redirects = (limit: number) =>
      vi.fn<typeof fetch>(async () => (n++ < limit ? new Response(null, { status: 302, headers: { location: `/r${n}` } }) : imageResponse()))

    n = 0
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl: redirects(3), lookup: publicLookup })).resolves.toBeInstanceOf(Buffer)
    n = 0
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl: redirects(4), lookup: publicLookup })).rejects.toThrow(/redirecciones/i)
  })

  it('el fetch no sigue redirecciones por su cuenta', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse())
    await fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe('manual')
  })

  it('respuesta que no es imagen → rechazada', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    await expect(fetchPosterBytes('https://cdn.example.com/p', { fetchImpl, lookup: publicLookup })).rejects.toThrow(/imagen/i)
  })

  it('error HTTP → rechazado', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('nope', { status: 404, headers: { 'content-type': 'image/png' } }))
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })).rejects.toThrow(/404/)
  })

  it('el límite es de 15 MB', () => {
    expect(POSTER_MAX_BYTES).toBe(15 * 1024 * 1024)
    expect(POSTER_TIMEOUT_MS).toBe(10_000)
  })

  it('content-length mayor a 15 MB → rechazado sin leer el cuerpo', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse(png(), { 'content-length': String(POSTER_MAX_BYTES + 1) }))
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })).rejects.toThrow(/pesa/i)
  })

  it('sin content-length y un cuerpo de más de 15 MB → rechazado y deja de leer', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++
        controller.enqueue(chunk)
        if (sent > 100) controller.close()
      },
    })
    const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse(body))
    await expect(fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })).rejects.toThrow(/pesa/i)
    expect(sent).toBeLessThan(20)
  })

  it('exactamente 15 MB → se acepta', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse(new Uint8Array(POSTER_MAX_BYTES)))
    const bytes = await fetchPosterBytes('https://cdn.example.com/p.png', { fetchImpl, lookup: publicLookup })
    expect(bytes.length).toBe(POSTER_MAX_BYTES)
  })

  it('un servidor que no responde → se corta por tiempo', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))
    )
    const started = Date.now()
    await expect(fetchPosterBytes('https://lento.example.com/p.png', { fetchImpl, lookup: publicLookup, timeoutMs: 100 })).rejects.toThrow(/tardó/i)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
