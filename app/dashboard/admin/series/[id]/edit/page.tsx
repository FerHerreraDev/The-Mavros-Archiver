import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { getSeriesForAdmin } from '@/lib/data/series'
import { updateSeriesAction } from '@/lib/actions/series.actions'
import { MovieForm } from '@/components/admin/movie-form'
import { SeriesEpisodes } from '@/components/admin/series-table'

export const metadata = { title: 'Editar serie - Admin - The Mavros Archiver' }

export default async function EditSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  const { id } = await params
  const page = await getSeriesForAdmin(id)
  if (!page) notFound()

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <h3 className="text-lg font-semibold tracking-tight">Editar serie: {page.series.title}</h3>
        <MovieForm
          action={updateSeriesAction.bind(null, page.series.id)}
          movie={page.series}
          submitLabel="Guardar cambios"
          video={false}
          cancelHref="/dashboard/admin/series"
        />
      </div>
      <SeriesEpisodes seriesId={page.series.id} episodes={page.episodes} />
    </div>
  )
}
