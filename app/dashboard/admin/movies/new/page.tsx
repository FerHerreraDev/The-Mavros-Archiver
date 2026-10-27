import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { createMovieAction } from '@/lib/actions/movie.actions'
import { MovieForm } from '@/components/admin/movie-form'
import { listSeriesOptions } from '@/lib/data/series'

export const metadata = { title: 'Nueva película - Admin - The Mavros Archiver' }

export default async function NewMoviePage({ searchParams }: { searchParams: Promise<{ serie?: string }> }) {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  // "Agregar episodio" desde una serie llega con ?serie=<id> (SER-06)
  const [{ serie }, seriesOptions] = await Promise.all([searchParams, listSeriesOptions()])
  const preselected = seriesOptions.find((s) => s.id === serie)

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold tracking-tight">{preselected ? `Nuevo episodio de ${preselected.title}` : 'Nueva película'}</h3>
      <MovieForm
        action={createMovieAction}
        submitLabel="Guardar borrador"
        seriesOptions={seriesOptions}
        movie={preselected ? { series_id: preselected.id } : undefined}
        cancelHref={preselected ? `/dashboard/admin/series/${preselected.id}/edit` : undefined}
      />
    </div>
  )
}
