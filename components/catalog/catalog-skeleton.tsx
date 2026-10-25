// Esqueleto del catálogo. Va en un <Suspense> dentro de la página y NO como loading.tsx del
// dashboard: un loading.tsx empieza a responder (200) antes de que una página hija llame a
// notFound(), y el 404 se perdería (WATCH-01).
export function CatalogSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-56 rounded-lg bg-card animate-pulse" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] rounded-xl border border-border bg-card animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-card animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
