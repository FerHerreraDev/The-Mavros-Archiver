import { listPlaylists } from '@/lib/data/playlists'
import { ListsManager } from '@/components/lists/lists-manager'

export const metadata = { title: 'Mis listas - The Mavros Archiver' }

export default async function ListsPage() {
  const lists = await listPlaylists()
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Mis listas</h1>
        <p className="text-muted-foreground">Solo tú las ves. Arma el orden y reprodúcelas de corrido.</p>
      </div>
      <ListsManager lists={lists} />
    </div>
  )
}
