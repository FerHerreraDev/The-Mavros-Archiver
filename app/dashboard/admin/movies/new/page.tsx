import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { createMovieAction } from '@/lib/actions/movie.actions'
import { MovieForm } from '@/components/admin/movie-form'

export const metadata = { title: 'Nueva película - Admin - The Mavros Archiver' }

export default async function NewMoviePage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold tracking-tight">Nueva película</h3>
      <MovieForm action={createMovieAction} submitLabel="Guardar borrador" />
    </div>
  )
}
