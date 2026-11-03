'use client'

import { Dialog } from 'radix-ui'
import { Clapperboard, X } from 'lucide-react'

/**
 * "Ver tráiler" (CAT-09): el video de YouTube en una ventana encima de la página. El iframe solo se
 * monta al abrir (nada de YouTube carga antes) y usa youtube-nocookie (sin cookies de rastreo).
 * Esc, el botón o tocar fuera la cierran y el video se detiene.
 */
export function TrailerButton({ trailerKey, title }: { trailerKey: string; title: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-3 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Clapperboard className="h-4 w-4" />
        Ver tráiler
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,1100px)] -translate-x-1/2 -translate-y-1/2 space-y-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="truncate text-sm font-semibold text-foreground">Tráiler · {title}</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar tráiler"
              className="rounded-full p-2 text-foreground/80 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={`Tráiler de ${title}`}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full w-full"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
