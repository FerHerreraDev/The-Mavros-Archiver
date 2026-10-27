import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { createSeriesAction } from '@/lib/actions/series.actions'
import { MovieForm } from '@/components/admin/movie-form'

export const metadata = { title: 'Nueva serie - Admin - The Mavros Archiver' }

export default async function NewSeriesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold tracking-tight">Nueva serie</h3>
      <MovieForm action={createSeriesAction} submitLabel="Guardar borrador" video={false} cancelHref="/dashboard/admin/series" />
    </div>
  )
}
