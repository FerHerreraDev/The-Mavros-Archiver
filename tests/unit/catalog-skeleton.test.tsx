import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton'

// LOAD-01: el skeleton tiene la forma real del catálogo (el comportamiento en el navegador
// —shimmer, retraso de 200 ms, reducir movimiento— se prueba en tests/e2e/loading.spec.ts)
describe('CatalogSkeleton (LOAD-01)', () => {
  const html = renderToStaticMarkup(<CatalogSkeleton />)
  const doc = new DOMParserLike(html)

  it('se anuncia como "cargando" a lectores de pantalla, y los bloques se ocultan', () => {
    expect(html).toMatch(/role="status"/)
    expect(html).toMatch(/aria-busy="true"/)
    expect(html).toContain('Cargando catálogo')
    expect(html).toMatch(/<section[^>]*aria-hidden="true"/)
  })

  it('copia la rejilla real: mismas columnas que el catálogo', () => {
    expect(html).toContain('grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5')
  })

  it('cada tarjeta es un póster 2:3 con título y una línea de año · duración', () => {
    const cards = doc.all('data-testid="skeleton-card"')
    expect(cards.length).toBeGreaterThanOrEqual(10)
    for (const card of cards) {
      expect(card).toContain('aspect-[2/3]')
      expect(card.match(/class="skeleton /g)?.length, 'póster + 2 líneas').toBe(3)
    }
  })

  it('incluye título, subtítulo y chips de género', () => {
    expect(html.match(/rounded-full/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).toMatch(/skeleton h-7/)
  })

  it('aparece con retraso (sin parpadeo en cargas rápidas)', () => {
    expect(html).toMatch(/class="skeleton-delayed/)
  })
})

/** Mini-buscador de fragmentos por atributo (sin DOM en el entorno node) */
class DOMParserLike {
  constructor(private html: string) {}
  all(attr: string) {
    return this.html.split(attr).slice(1).map((chunk) => chunk.split('data-testid=')[0])
  }
}
