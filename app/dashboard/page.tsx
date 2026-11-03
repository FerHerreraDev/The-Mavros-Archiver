import { Suspense } from 'react'
import { Film, SearchX } from 'lucide-react'
import { getCatalog } from '@/lib/data/catalog'
import { searchCatalog } from '@/lib/search'
import { MovieCard, SeriesCard } from '@/components/catalog/movie-card'
import { GenreFilter } from '@/components/catalog/genre-filter'
import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton'
import { SearchBox } from '@/components/catalog/search-box'
import { FeaturedHero } from '@/components/catalog/featured-hero'
import { CatalogRow } from '@/components/catalog/catalog-row'
import { playlistMemberships } from '@/lib/data/playlists'
import { slugify } from '@/lib/movies'
import { RequestButton } from '@/components/requests/request-button'

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ genre?: string; q?: string }> }) {
  const { genre, q } = await searchParams
  const query = q?.trim() ?? ''
  return (
    <div className="space-y-8">
      <SearchBox initial={query} />
      {/* Sin key por búsqueda: al escribir se queda lo anterior hasta que llegan los resultados (SRCH-02) */}
      <Suspense key={query ? 'search' : (genre ?? '')} fallback={<CatalogSkeleton variant={query || genre ? 'grid' : 'home'} />}>
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
  const { genres, recent, series, continueWatching, featured } = await getCatalog(genre)

  if (recent.length === 0 && series.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <GenreFilter genres={genres} active={genre} />
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-12 text-center space-y-2">
          <Film className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{genre ? `No hay películas de "${genre}" todavía.` : 'La bóveda está vacía por ahora.'}</p>
        </div>
      </div>
    )
  }
  return genre ? <GenreGrid genre={genre} genres={genres} movies={recent} series={series} /> : <Home {...{ genres, recent, series, continueWatching, featured }} />
}

type CatalogData = Awaited<ReturnType<typeof getCatalog>>

/** Un género elegido (CAT-04): todo lo de ese género en cuadrícula */
function GenreGrid({ genre, genres, movies, series }: { genre: string; genres: string[]; movies: CatalogData['recent']; series: CatalogData['series'] }) {
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <section aria-labelledby="recent-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="recent-heading" className="text-2xl font-bold tracking-tight">Recién agregadas</h2>
          <p className="text-muted-foreground first-letter:uppercase">{genre}</p>
        </div>
        <GenreFilter genres={genres} active={genre} />
        {movies.length > 0 && (
          <div className={GRID}>
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
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

/** Fila por género con al menos estas tarjetas (una sola tarjeta no hace fila) (CAT-08) */
const GENRE_ROW_MIN = 2

/** Portada (CAT-07, CAT-08): destacadas arriba y el catálogo en filas que se deslizan */
async function Home({ genres, recent, series, continueWatching, featured }: CatalogData) {
  const lists = featured.length ? await playlistMemberships(featured.map((f) => ({ kind: f.kind, id: f.id }))) : new Map()
  const byPublished = (a: { published_at: string | null }, b: { published_at: string | null }) => Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? '')
  const genreRows = genres
    .map((g) => ({
      genre: g,
      items: [...recent.filter((m) => m.genres.includes(g)).map((m) => ({ kind: 'movie' as const, ...m })), ...series.filter((s) => s.genres.includes(g)).map((s) => ({ kind: 'series' as const, ...s }))].sort(byPublished),
    }))
    .filter((row) => row.items.length >= GENRE_ROW_MIN)

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {featured.length > 0 && <FeaturedHero items={featured} lists={Object.fromEntries(lists)} />}

      <GenreFilter genres={genres} />

      {continueWatching.length > 0 && (
        <CatalogRow id="continue" title="Seguir viendo">
          {continueWatching.map(({ movie, positionSeconds, episode }) => (
            <MovieCard key={movie.id} movie={movie} positionSeconds={positionSeconds} episode={episode} />
          ))}
        </CatalogRow>
      )}

      {recent.length > 0 && (
        <CatalogRow id="recent" title="Recién agregadas" subtitle="Tu bóveda personal de cine.">
          {recent.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </CatalogRow>
      )}

      {series.length > 0 && (
        <CatalogRow id="series" title="Series">
          {series.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </CatalogRow>
      )}

      {genreRows.map(({ genre, items }) => (
        <CatalogRow key={genre} id={`genre-${slugify(genre)}`} title={genre}>
          {items.map((item) => (item.kind === 'movie' ? <MovieCard key={item.id} movie={item} /> : <SeriesCard key={item.id} series={item} />))}
        </CatalogRow>
      ))}

      {featured.length > 0 && <p className="text-[11px] text-muted-foreground">Datos e imágenes: TMDB.</p>}
    </div>
  )
}
