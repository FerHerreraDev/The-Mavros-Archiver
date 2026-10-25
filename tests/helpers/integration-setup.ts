import { vi } from 'vitest'

// Límite de framework: next/headers y next/cache solo existen dentro de un request de Next.
// Se sustituyen por un request simulado; Supabase, Zod y la lógica de la app corren de verdad.
vi.mock('next/headers', async () => {
  const { requestContext } = await import('./request-context')
  return {
    cookies: async () => requestContext.cookies,
    headers: async () => requestContext.headers,
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
