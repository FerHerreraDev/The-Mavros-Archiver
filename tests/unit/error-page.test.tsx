import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DashboardError from '@/app/dashboard/error'

describe('página de error del dashboard (OPS-06)', () => {
  const error = Object.assign(new Error('relation "movies" does not exist at secret-host:5432'), { digest: 'abc123' })
  const html = renderToStaticMarkup(<DashboardError error={error} reset={vi.fn()} />)

  it('no muestra el mensaje técnico del error', () => {
    expect(html).not.toContain('relation')
    expect(html).not.toContain('secret-host')
  })

  it('ofrece reintentar y volver, y muestra el digest para soporte', () => {
    expect(html).toContain('Reintentar')
    expect(html).toContain('Volver al catálogo')
    expect(html).toContain('abc123')
  })
})
