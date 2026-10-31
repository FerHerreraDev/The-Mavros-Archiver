import { listMyRequests } from '@/lib/data/requests'
import { RequestsManager } from '@/components/requests/requests-manager'

export const metadata = { title: 'Mis pedidos - The Mavros Archiver' }

export default async function RequestsPage() {
  const requests = await listMyRequests()
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Mis pedidos</h1>
        <p className="text-muted-foreground">¿Falta algo en la bóveda? Pídelo y el admin te avisa aquí cuando esté.</p>
      </div>
      <RequestsManager requests={requests} />
    </div>
  )
}
