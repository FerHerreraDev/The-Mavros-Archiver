import { describe, it, expect, vi } from 'vitest'
import type { Lookup } from '@/lib/poster/fetch-poster'

// LOAD-03: si el binario nativo de sharp no carga (p. ej. en el servidor de producción), importar
// las acciones de películas —lo que hacen las páginas de crear y editar— no debe romperse
vi.mock('sharp', () => {
  throw new Error('Could not load the "sharp" module using the linux-x64 runtime')
})

const lookup: Lookup = async () => [{ address: '151.101.1.140' }]

describe('sharp no disponible (LOAD-03)', () => {
  it('importar las acciones de películas no falla', async () => {
    await expect(import('@/lib/actions/movie.actions')).resolves.toHaveProperty('updateMovieAction')
  })

  it('calcular la vista previa devuelve null, sin lanzar', async () => {
    const { computePosterThumbhash } = await import('@/lib/poster/thumbhash')
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
    await expect(computePosterThumbhash('https://cdn.example.com/p.png', { fetchImpl, lookup })).resolves.toBeNull()
  })
})
