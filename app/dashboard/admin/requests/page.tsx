import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guards'
import { listAllRequests } from '@/lib/data/requests'
import { RequestsTable } from '@/components/admin/requests-table'

export const metadata = { title: 'Pedidos - The Mavros Archiver' }

export default async function AdminRequestsPage() {
  if (!(await requireAdmin())) redirect('/dashboard')
  const requests = await listAllRequests()
  return <RequestsTable requests={requests} />
}
