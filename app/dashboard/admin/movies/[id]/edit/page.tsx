import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { getMovieForAdmin } from '@/lib/data/movies'
import { updateMovieAction } from '@/lib/actions/movie.actions'
import { MovieForm } from '@/components/admin/movie-form'
import { listSeriesOptions } from '@/lib/data/series'

export const metadata = { title: 'Editar película - Admin - The Mavros Archiver' }

export default async function EditMoviePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  const { id } = await params
  const [movie, seriesOptions] = await Promise.all([getMovieForAdmin(id), listSeriesOptions()])
  if (!movie) notFound()

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold tracking-tight">Editar: {movie.title}</h3>
      <MovieForm action={updateMovieAction.bind(null, movie.id)} movie={movie} submitLabel="Guardar cambios" seriesOptions={seriesOptions} />
    </div>
  )
}
