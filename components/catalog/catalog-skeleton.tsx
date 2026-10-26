// Esqueleto del catálogo. Va en un <Suspense> dentro de la página y NO como loading.tsx del
// dashboard: un loading.tsx empieza a responder (200) antes de que una página hija llame a
// notFound(), y el 404 se perdería (WATCH-01).
//
// Copia la forma real de la página (LOAD-01): título y subtítulo de la sección, chips de
// género y la misma rejilla de pósters 2:3 con título y año · duración debajo. Así, al llegar
// los datos, nada salta de lugar. Las clases .skeleton y .skeleton-delayed viven en globals.css.

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
const CHIP_WIDTHS = ['w-16', 'w-20', 'w-14', 'w-24', 'w-[4.5rem]']
// Anchos variados: bloques idénticos se ven "de plantilla"; variados se leen como texto
const TITLE_WIDTHS = ['w-4/5', 'w-3/5', 'w-11/12', 'w-2/3', 'w-3/4']

export const SKELETON_CARDS = 10

export function CatalogSkeleton() {
  return (
    <div className="skeleton-delayed space-y-10" role="status" aria-busy="true" data-testid="catalog-skeleton">
      <span className="sr-only">Cargando catálogo…</span>
      <section className="space-y-4" aria-hidden>
        <div className="space-y-2">
          <div className="skeleton h-7 w-56 rounded-lg" />
          <div className="skeleton h-4 w-48 rounded-md" />
        </div>

        <div className="flex gap-2 overflow-hidden pb-1">
          {CHIP_WIDTHS.map((w, i) => (
            <div key={i} className={`skeleton h-[30px] shrink-0 rounded-full ${w}`} />
          ))}
        </div>

        <div className={GRID}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <div key={i} data-testid="skeleton-card">
              <div className="skeleton aspect-[2/3] rounded-xl border border-border" />
              <div className="mt-2 space-y-1.5">
                <div className={`skeleton h-3.5 rounded ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
                <div className="skeleton h-2.5 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
