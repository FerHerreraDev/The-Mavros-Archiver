'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Pencil, Eye, EyeOff, Trash2, Film } from 'lucide-react'
import { setMovieStatusAction, deleteMovieAction, type MovieActionResult } from '@/lib/actions/movie.actions'
import { formatDuration, type Movie } from '@/lib/movies'
import { cn } from '@/lib/utils'

const ACTION_BUTTON =
  'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-card hover:text-foreground text-muted-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none'
const BADGE = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide'

export function MoviesTable({ movies }: { movies: Movie[] }) {
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

function MovieRow({ movie }: { movie: Movie }) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<MovieActionResult | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const run = (action: () => Promise<MovieActionResult>) => {
    startTransition(async () => {
      setFeedback(null)
      try {
        setFeedback(await action())
      } catch (err) {
        console.error('Movie action error:', err)
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })
  }

  const published = movie.status === 'published'

  return (
    <tr className="align-middle">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-card">
            {movie.poster_url ? (
              <Image src={movie.poster_url} alt="" fill sizes="40px" unoptimized className="object-cover" />
            ) : (
              <Film className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="text-foreground font-medium">{movie.title}</div>
            <div className="text-[11px] font-mono text-muted-foreground">{movie.slug}</div>
            {feedback?.error && <p className="text-xs text-destructive mt-1" role="alert">{feedback.error}</p>}
            {feedback?.success && <p className="text-xs text-emerald-400 mt-1" role="status">{feedback.success}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-muted-foreground">{movie.release_year ?? '—'}</td>
      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{formatDuration(movie.duration_seconds)}</td>
      <td className="px-3 py-3">
        <span
          className={cn(
            BADGE,
            published ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'
          )}
        >
          {published ? 'Publicada' : 'Borrador'}
        </span>
      </td>
      <td className="px-6 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/dashboard/admin/movies/${movie.id}/edit`} className={ACTION_BUTTON} aria-label={`Editar ${movie.title}`}>
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={isPending}
            aria-label={published ? `Despublicar ${movie.title}` : `Publicar ${movie.title}`}
            onClick={() => run(() => setMovieStatusAction({ id: movie.id, status: published ? 'draft' : 'published' }))}
          >
            {published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {published ? 'Despublicar' : 'Publicar'}
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                className={`${ACTION_BUTTON} border-destructive/50 text-destructive`}
                disabled={isPending}
                aria-label={`Confirmar borrar ${movie.title}`}
                onClick={() => run(() => deleteMovieAction({ id: movie.id }))}
              >
                <Trash2 className="h-3.5 w-3.5" />
                ¿Seguro? Borrar
              </button>
              <button type="button" className={ACTION_BUTTON} disabled={isPending} onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${ACTION_BUTTON} hover:border-destructive/50 hover:text-destructive`}
              disabled={isPending}
              aria-label={`Borrar ${movie.title}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
