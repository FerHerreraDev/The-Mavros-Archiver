import Link from 'next/link'

type Props = {
  code: string
  title: string
  message: string
  action?: React.ReactNode
  homeHref?: string
}

/** Página de estado (404, error) con el estilo de la app (OPS-05, OPS-06) */
export function StatusPage({ code, title, message, action, homeHref = '/dashboard' }: Props) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-8 text-center space-y-4">
        <span className="inline-block text-xs font-mono text-muted-foreground uppercase tracking-wide border border-border px-3 py-1 rounded">
          {code}
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {action}
          <Link
            href={homeHref}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Volver al catálogo
          </Link>
        </div>
      </div>
    </div>
  )
}
