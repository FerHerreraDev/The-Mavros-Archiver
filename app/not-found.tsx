import { StatusPage } from '@/components/ui/status-page'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <StatusPage code="404" title="Esta página no existe" message="Puede que el enlace esté mal o que la película ya no esté en la bóveda." />
    </main>
  )
}
