import 'server-only'
import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

// El servidor descarga una URL que escribió un admin: sin estas reglas se podría usar para
// leer la red interna (SSRF), p. ej. http://169.254.169.254 o un servicio en localhost (LOAD-05).
export const POSTER_MAX_BYTES = 15 * 1024 * 1024
export const POSTER_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

export class PosterFetchError extends Error {}

const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "esta" red
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (metadatos de la nube)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // IETF
  ['192.0.2.0', 24], // documentación
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmarks
  ['198.51.100.0', 24], // documentación
  ['203.0.113.0', 24], // documentación
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada + broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['::', 128], // sin especificar
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64: puede apuntar a cualquier IPv4
  ['100::', 64], // descarte
  ['2001:db8::', 32], // documentación
  ['fc00::', 7], // única local (privada)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6')
}

/** true si la IP es local, privada o reservada (también IPv4 dentro de IPv6: ::ffff:127.0.0.1) */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '')
  const family = isIP(ip)
  if (family === 4) return blocked.check(ip, 'ipv4')
  if (family !== 6) return true // no es una IP: no se confía
  const mapped = ip.toLowerCase().match(/^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return blocked.check(mapped[1], 'ipv4')
  // ::ffff:7f00:1 (la misma IPv4 escrita en hexadecimal)
  const mappedHex = ip.toLowerCase().match(/^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4')
  }
  return blocked.check(ip, 'ipv6')
}

export type Lookup = (host: string) => Promise<{ address: string }[]>
export type FetchPosterOptions = { fetchImpl?: typeof fetch; lookup?: Lookup; timeoutMs?: number }

const defaultLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true })

async function assertPublicHttps(raw: string, lookup: Lookup): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new PosterFetchError('URL inválida')
  }
  if (url.protocol !== 'https:') throw new PosterFetchError('Solo se aceptan pósters por https')
  if (url.username || url.password) throw new PosterFetchError('La URL no puede llevar usuario ni contraseña')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) throw new PosterFetchError('Dirección local no permitida')

  const addresses = isIP(host) ? [{ address: host }] : await lookup(host).catch(() => [])
  if (addresses.length === 0) throw new PosterFetchError('No se encontró el servidor del póster')
  // Todas: si un nombre resuelve a una IP pública y a una privada, se rechaza
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new PosterFetchError('Dirección local o privada no permitida')
  return url
}

/**
 * Descarga el póster con las reglas de LOAD-05. Riesgo residual conocido: `fetch` vuelve a
 * resolver el DNS (un DNS que cambia entre ambas consultas podría colarse); solo los admins
 * escriben esta URL, así que se acepta.
 */
export async function fetchPosterBytes(rawUrl: string, options: FetchPosterOptions = {}): Promise<Buffer> {
  const { fetchImpl = fetch, lookup = defaultLookup, timeoutMs = POSTER_TIMEOUT_MS } = options
  const signal = AbortSignal.timeout(timeoutMs)

  try {
    let current = rawUrl
    for (let hop = 0; ; hop++) {
      const url = await assertPublicHttps(current, lookup)
      const res = await fetchImpl(url, { redirect: 'manual', signal, headers: { accept: 'image/*' } })

      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel()
        const location = res.headers.get('location')
        if (!location || hop >= MAX_REDIRECTS) throw new PosterFetchError('Demasiadas redirecciones')
        current = new URL(location, url).toString() // cada salto se vuelve a validar
        continue
      }
      if (!res.ok) {
        await res.body?.cancel()
        throw new PosterFetchError(`El póster respondió ${res.status}`)
      }

      const type = res.headers.get('content-type') ?? ''
      if (!/^image\//i.test(type)) {
        await res.body?.cancel()
        throw new PosterFetchError('La URL no es una imagen')
      }
      const declared = Number(res.headers.get('content-length'))
      if (declared > POSTER_MAX_BYTES) {
        await res.body?.cancel()
        throw new PosterFetchError('El póster pesa demasiado')
      }
      return await readLimited(res, POSTER_MAX_BYTES)
    }
  } catch (err) {
    if (err instanceof PosterFetchError) throw err
    if (signal.aborted) throw new PosterFetchError('El póster tardó demasiado')
    throw new PosterFetchError('No se pudo descargar el póster')
  }
}

// content-length puede faltar o mentir: se cuenta lo que llega de verdad
async function readLimited(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      throw new PosterFetchError('El póster pesa demasiado')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
