import Link from 'next/link'
import { LinkPendingIcon } from '@/components/ui/link-pending'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/guards'
import { listMoviesForAdmin } from '@/lib/data/movies'
import { MoviesTable } from '@/components/admin/movies-table'

export const metadata = { title: 'Películas - Admin - The Mavros Archiver' }

export default async function AdminMoviesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  const movies = await listMoviesForAdmin()
  if (!movies) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Catalog</span>
          <h3 className="text-lg font-semibold tracking-tight">Películas</h3>
          <p className="text-sm text-muted-foreground">Los borradores solo los ven los admins.</p>
        </div>
        <Link
          href="/dashboard/admin/movies/new"
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <LinkPendingIcon className="h-4 w-4">
            <Plus className="h-4 w-4" />
          </LinkPendingIcon>
          Nueva película
        </Link>
      </div>
      <MoviesTable movies={movies} />
    </div>
  )
}
