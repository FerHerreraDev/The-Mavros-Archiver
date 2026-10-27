import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Play } from 'lucide-react'
import { getPlaylist } from '@/lib/data/playlists'
import { PlaylistItems } from '@/components/lists/playlist-items'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const page = await getPlaylist((await params).id)
  return { title: page ? `${page.playlist.name} - The Mavros Archiver` : 'The Mavros Archiver' }
}

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // RLS: solo mis listas; una ajena o inexistente → 404 (PL-05)
  const page = await getPlaylist(id)
  if (!page) notFound()
  const { playlist, items, start } = page

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link href="/dashboard/lists" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mis listas
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{playlist.name}</h1>
        {start && (
          <Link
            href={`/dashboard/watch/${start.episode.slug}?lista=${playlist.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Play className="h-4 w-4 fill-current" />
            Reproducir lista
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta lista está vacía. Usa <strong>Agregar a lista</strong> en una película o serie.
        </p>
      ) : (
        <PlaylistItems playlistId={playlist.id} items={items} />
      )}
    </div>
  )
}
