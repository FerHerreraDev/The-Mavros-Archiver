import { Suspense } from 'react'
import { Film } from 'lucide-react'
import { getCatalog } from '@/lib/data/catalog'
import { MovieCard, SeriesCard } from '@/components/catalog/movie-card'
import { GenreFilter } from '@/components/catalog/genre-filter'
import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton'

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams
  return (
    <Suspense key={genre ?? ''} fallback={<CatalogSkeleton />}>
      <Catalog genre={genre} />
    </Suspense>
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
