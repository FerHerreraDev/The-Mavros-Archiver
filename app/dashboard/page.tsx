import { Suspense } from 'react'
import { Film, SearchX } from 'lucide-react'
import { getCatalog } from '@/lib/data/catalog'
import { searchCatalog } from '@/lib/search'
import { MovieCard, SeriesCard } from '@/components/catalog/movie-card'
import { GenreFilter } from '@/components/catalog/genre-filter'
import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton'
import { SearchBox } from '@/components/catalog/search-box'
import { RequestButton } from '@/components/requests/request-button'

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ genre?: string; q?: string }> }) {
  const { genre, q } = await searchParams
  const query = q?.trim() ?? ''
  return (
    <div className="space-y-8">
      <SearchBox initial={query} />
      {/* Sin key por búsqueda: al escribir se queda lo anterior hasta que llegan los resultados (SRCH-02) */}
      <Suspense key={query ? 'search' : (genre ?? '')} fallback={<CatalogSkeleton />}>
        {query ? <Results query={query} /> : <Catalog genre={genre} />}
      </Suspense>
    </div>
  )
}

/** Resultados de la búsqueda: películas y series publicadas (SRCH-01..SRCH-03) */
async function Results({ query }: { query: string }) {
  const { recent, series } = await getCatalog()
  const items = searchCatalog([...recent.map((m) => ({ ...m, kind: 'movie' as const })), ...series.map((s) => ({ ...s, kind: 'series' as const }))], query)

  return (
    <section aria-labelledby="results-heading" className="space-y-4 animate-in fade-in duration-300">
      <h2 id="results-heading" className="text-2xl font-bold tracking-tight">
        Resultados para «{query}»
      </h2>
      {items.length > 0 ? (
        <div className={GRID}>
          {items.map((item) => (item.kind === 'movie' ? <MovieCard key={item.id} movie={item} /> : <SeriesCard key={item.id} series={item} />))}
        </div>
      ) : (
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-12 text-center space-y-4">
          <SearchX className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No encontramos «{query}».</p>
          <RequestButton key={query} title={query} />
        </div>
      )}
    </section>
  )
}

async function Catalog({ genre }: { genre?: string }) {
  const { genres, recent, series, continueWatching } = await getCatalog(genre)

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {continueWatching.length > 0 && (
        <section aria-labelledby="continue-heading" className="space-y-4">
          <h2 id="continue-heading" className="text-xl font-bold tracking-tight">Seguir viendo</h2>
          <div className={GRID}>
            {continueWatching.map(({ movie, positionSeconds, episode }) => (
              <MovieCard key={movie.id} movie={movie} positionSeconds={positionSeconds} episode={episode} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="recent-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="recent-heading" className="text-2xl font-bold tracking-tight">Recién agregadas</h2>
          <p className="text-muted-foreground">Tu bóveda personal de cine.</p>
        </div>

        <GenreFilter genres={genres} active={genre} />

        {recent.length > 0 && (
          <div className={GRID}>
            {recent.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
        {recent.length === 0 && series.length === 0 && (
          <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-12 text-center space-y-2">
            <Film className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {genre ? `No hay películas de "${genre}" todavía.` : 'La bóveda está vacía por ahora.'}
            </p>
          </div>
        )}
      </section>

      {series.length > 0 && (
        <section aria-labelledby="series-heading" className="space-y-4">
          <h2 id="series-heading" className="text-2xl font-bold tracking-tight">Series</h2>
          <div className={GRID}>
            {series.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
