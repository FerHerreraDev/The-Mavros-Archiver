import Link from 'next/link'
import { LinkPendingIcon } from '@/components/ui/link-pending'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/guards'
import { listSeriesForAdmin } from '@/lib/data/series'
import { SeriesTable } from '@/components/admin/series-table'

export const metadata = { title: 'Series - Admin - The Mavros Archiver' }

export default async function AdminSeriesPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  const series = await listSeriesForAdmin()
  if (!series) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Catalog</span>
          <h3 className="text-lg font-semibold tracking-tight">Series</h3>
          <p className="text-sm text-muted-foreground">Un episodio solo se ve si él y su serie están publicados.</p>
        </div>
        <Link
          href="/dashboard/admin/series/new"
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <LinkPendingIcon className="h-4 w-4">
            <Plus className="h-4 w-4" />
          </LinkPendingIcon>
          Nueva serie
        </Link>
      </div>
      <SeriesTable series={series} />
    </div>
  )
}
