import { describe, it, expect } from 'vitest'
import { safeInternalPath } from '@/lib/safe-redirect'

// Resuelve como un navegador y confirma que no salió del sitio
function staysOnSite(path: string) {
  return new URL(path, 'https://mavros.example').origin === 'https://mavros.example'
}

describe('safeInternalPath (CNF-01, ACC-08)', () => {
  it.each(['/dashboard', '/dashboard/profile', '/dashboard/watch/123?t=42'])('conserva ruta interna %s', (path) => {
    expect(safeInternalPath(path)).toBe(path)
  })

  it.each([
    'https://evil.com',
    'http://evil.com/dashboard',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/\\/evil.com',
    '\\/evil.com',
    ' //evil.com',
    '\t//evil.com',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https:evil.com',
  ])('nunca devuelve algo que salga del sitio: %j', (next) => {
    const result = safeInternalPath(next)
    expect(staysOnSite(result)).toBe(true)
    expect(result.startsWith('/')).toBe(true)
  })

  it.each([null, undefined, '', 42])('valor vacío o no-string → fallback (%j)', (next) => {
    expect(safeInternalPath(next)).toBe('/dashboard')
    expect(safeInternalPath(next, '/x')).toBe('/x')
  })
})
