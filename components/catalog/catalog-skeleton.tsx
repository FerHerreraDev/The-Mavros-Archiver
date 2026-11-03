// Esqueleto del catálogo. Va en un <Suspense> dentro de la página y NO como loading.tsx del
// dashboard: un loading.tsx empieza a responder (200) antes de que una página hija llame a
// notFound(), y el 404 se perdería (WATCH-01).
//
// Copia la forma real de la página (LOAD-01). Dos formas:
// - "home": la portada (CAT-07, CAT-08): destacada grande, chips de género y filas de pósters.
// - "grid": un género o una búsqueda: título, chips y la rejilla de pósters.
// Las tarjetas son pósters 2:3 con título y año · duración debajo. Así, al llegar los datos, nada
// salta de lugar. Las clases .skeleton y .skeleton-delayed viven en globals.css.

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
/** Mismo ancho de tarjeta que components/catalog/catalog-row.tsx */
const ROW_CARD = 'w-[42%] shrink-0 sm:w-[30%] md:w-[23%] lg:w-[18%]'
const CHIP_WIDTHS = ['w-16', 'w-20', 'w-14', 'w-24', 'w-[4.5rem]']
// Anchos variados: bloques idénticos se ven "de plantilla"; variados se leen como texto
const TITLE_WIDTHS = ['w-4/5', 'w-3/5', 'w-11/12', 'w-2/3', 'w-3/4']
const ROWS = 2
const ROW_CARDS = 6

export const SKELETON_CARDS = 10

function Card({ i, className }: { i: number; className?: string }) {
  return (
    <div data-testid="skeleton-card" className={className}>
      <div className="skeleton aspect-[2/3] rounded-xl border border-border" />
      <div className="mt-2 space-y-1.5">
        <div className={`skeleton h-3.5 rounded ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
    </div>
  )
}

function Chips() {
  return (
    <div className="flex gap-2 overflow-hidden pb-1">
      {CHIP_WIDTHS.map((w, i) => (
        <div key={i} className={`skeleton h-[30px] shrink-0 rounded-full ${w}`} />
      ))}
    </div>
  )
}

export function CatalogSkeleton({ variant = 'grid' }: { variant?: 'home' | 'grid' }) {
  return (
    <div className="skeleton-delayed space-y-10" role="status" aria-busy="true" data-testid="catalog-skeleton">
      <span className="sr-only">Cargando catálogo…</span>
      {variant === 'home' ? (
        <>
          <section aria-hidden data-testid="skeleton-hero" className="skeleton relative flex min-h-[460px] flex-col justify-end gap-4 rounded-3xl border border-border px-5 pb-6 sm:min-h-[min(68vh,600px)] sm:px-10 sm:pb-10">
            <div className="h-12 w-2/3 max-w-md rounded-lg bg-foreground/5 sm:h-20" />
            <div className="h-3 w-48 rounded bg-foreground/5" />
            <div className="h-11 w-36 rounded-full bg-foreground/5" />
          </section>
          <section aria-hidden>
            <Chips />
          </section>
          {Array.from({ length: ROWS }, (_, r) => (
            <section key={r} aria-hidden className="space-y-3">
              <div className="skeleton h-7 w-56 rounded-lg" />
              <div className="-mx-4 flex gap-3 overflow-hidden px-4 py-2 sm:-mx-6 sm:gap-4 sm:px-6">
                {Array.from({ length: ROW_CARDS }, (_, i) => (
                  <Card key={i} i={i + r} className={ROW_CARD} />
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        <section className="space-y-4" aria-hidden>
          <div className="space-y-2">
            <div className="skeleton h-7 w-56 rounded-lg" />
            <div className="skeleton h-4 w-48 rounded-md" />
          </div>
          <Chips />
          <div className={GRID}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Card key={i} i={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
