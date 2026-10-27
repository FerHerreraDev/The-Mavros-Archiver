'use client'

import { Film } from 'lucide-react'
import { setMovieStatusAction, deleteMovieAction } from '@/lib/actions/movie.actions'
import { formatDuration } from '@/lib/movies'
import { episodeLabel } from '@/lib/series'
import type { AdminMovie } from '@/lib/data/movies'
import { RowActions, Thumb } from './row-actions'

export function MoviesTable({ movies }: { movies: AdminMovie[] }) {
  if (movies.length === 0) {
    return (
      <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-10 text-center space-y-2">
        <Film className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Todavía no hay películas en la bóveda.</p>
      </div>
    )
  }

  return (
    <section className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-6 py-3 font-normal">Película</th>
              <th scope="col" className="px-3 py-3 font-normal">Año</th>
              <th scope="col" className="px-3 py-3 font-normal">Duración</th>
              <th scope="col" className="px-3 py-3 font-normal">Estado</th>
              <th scope="col" className="px-6 py-3 font-normal text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {movies.map((movie) => (
              <MovieRow key={movie.id} movie={movie} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MovieRow({ movie }: { movie: AdminMovie }) {
  const published = movie.status === 'published'
  const isEpisode = movie.series && movie.season_number !== null && movie.episode_number !== null

  return (
    <RowActions
      title={movie.title}
      editHref={`/dashboard/admin/movies/${movie.id}/edit`}
      published={published}
      onToggleStatus={() => setMovieStatusAction({ id: movie.id, status: published ? 'draft' : 'published' })}
      onDelete={() => deleteMovieAction({ id: movie.id })}
      cells={(feedback) => (
        <>
          <td className="px-6 py-3">
            <div className="flex items-center gap-3">
              <Thumb src={movie.poster_image_url ?? movie.poster_url} />
              <div>
                <div className="text-foreground font-medium">{movie.title}</div>
                {isEpisode && (
                  <div className="text-xs text-muted-foreground">
                    {movie.series!.title} · {episodeLabel(movie.season_number!, movie.episode_number!)}
                  </div>
                )}
                <div className="text-[11px] font-mono text-muted-foreground">{movie.slug}</div>
                {feedback}
              </div>
            </div>
          </td>
          <td className="px-3 py-3 text-muted-foreground">{movie.release_year ?? '—'}</td>
          <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{formatDuration(movie.duration_seconds)}</td>
        </>
      )}
    />
  )
}
